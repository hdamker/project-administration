"""Thin GitHub REST client for the repository-config tool.

Reads are ``plan``; the write methods are only called by ``apply``.
"""

import base64
import os
import subprocess
import time
from typing import Any, Dict, List, Optional

import requests

API = "https://api.github.com"
RETRY_STATUS_CODES = frozenset({502, 503, 504})
RETRY_BACKOFF_SECONDS = (1, 2, 4)
# GitHub's own lookup order for CODEOWNERS.
CODEOWNERS_PATHS = (".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS")

CLASSIC_RULES_QUERY = """
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    branchProtectionRules(first: 100) {
      pageInfo { hasNextPage }
      nodes { id pattern }
    }
  }
}
"""

DELETE_CLASSIC_RULE_MUTATION = """
mutation($id: ID!) {
  deleteBranchProtectionRule(input: {branchProtectionRuleId: $id}) { clientMutationId }
}
"""


class GitHubError(Exception):
    """An API call failed."""


class RepoNotFound(GitHubError):
    """The repository (or the resource's parent) does not exist."""


class MissingBypassActors(GitHubError):
    """GET ruleset omitted ``bypass_actors``: the caller lacks write access to it."""


def resolve_token() -> str:
    """GITHUB_TOKEN, else the operator's ``gh`` login."""
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        return token
    try:
        out = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise GitHubError("no GITHUB_TOKEN and `gh auth token` failed") from exc
    return out.stdout.strip()


class GitHubAPI:
    def __init__(self, token: Optional[str] = None, session=None, sleep=time.sleep):
        self.session = session or requests.Session()
        self.session.headers["Authorization"] = f"Bearer {token or resolve_token()}"
        self.session.headers["Accept"] = "application/vnd.github+json"
        self.session.headers["X-GitHub-Api-Version"] = "2022-11-28"
        self._sleep = sleep
        self.api_calls = 0

    # -- transport ---------------------------------------------------------

    def _request(self, method: str, path: str, retry: Optional[bool] = None, **kwargs):
        """Send a request; reads are retried on transient errors, writes are not.

        A write that failed with a 5xx may still have been carried out, so
        repeating it can fail or act twice; the caller re-plans instead.
        """
        if retry is None:
            retry = method == "GET"
        retries = len(RETRY_BACKOFF_SECONDS) if retry else 0
        url = path if path.startswith("http") else f"{API}{path}"
        for attempt in range(retries + 1):
            self.api_calls += 1
            try:
                resp = self.session.request(method, url, timeout=30, **kwargs)
            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
                if attempt < retries:
                    self._sleep(RETRY_BACKOFF_SECONDS[attempt])
                    continue
                raise
            if resp.status_code in RETRY_STATUS_CODES and attempt < retries:
                self._sleep(RETRY_BACKOFF_SECONDS[attempt])
                continue
            return resp
        return resp  # pragma: no cover

    @staticmethod
    def _message(resp) -> str:
        try:
            return str(resp.json().get("message", resp.text))
        except (ValueError, AttributeError):
            return resp.text

    def _check(self, resp, what: str):
        if resp.status_code == 403 and resp.headers.get("X-RateLimit-Remaining") == "0":
            raise GitHubError(f"{what}: API rate limit exhausted")
        if resp.status_code == 404:
            raise RepoNotFound(f"{what}: {self._message(resp)}")
        if not resp.ok:
            raise GitHubError(f"{what}: HTTP {resp.status_code} {self._message(resp)}")
        return resp

    def _get_json(self, path: str, what: str) -> Any:
        return self._check(self._request("GET", path), what).json()

    def _paginate(self, path: str, what: str) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        url: Optional[str] = path
        while url:
            resp = self._check(self._request("GET", url), what)
            items.extend(resp.json())
            url = None
            for part in resp.headers.get("Link", "").split(","):
                if 'rel="next"' in part:
                    url = part[part.index("<") + 1:part.index(">")]
        return items

    # -- reads -------------------------------------------------------------

    def list_org_repos(self, org: str) -> List[Dict[str, Any]]:
        return self._paginate(f"/orgs/{org}/repos?per_page=100&type=all", f"list repos of {org}")

    def get_repo(self, org: str, repo: str) -> Dict[str, Any]:
        return self._get_json(f"/repos/{org}/{repo}", f"get repo {repo}")

    def list_rulesets(self, org: str, repo: str) -> List[Dict[str, Any]]:
        """Summaries only (id, name, target, enforcement); use get_ruleset for content."""
        return self._paginate(f"/repos/{org}/{repo}/rulesets?per_page=100", f"list rulesets of {repo}")

    def get_ruleset(self, org: str, repo: str, ruleset_id: int) -> Dict[str, Any]:
        body = self._get_json(f"/repos/{org}/{repo}/rulesets/{ruleset_id}", f"get ruleset {ruleset_id} of {repo}")
        if "bypass_actors" not in body:
            raise MissingBypassActors(
                f"{repo} ruleset {ruleset_id}: bypass_actors missing from the response "
                "(token needs write access to the ruleset)"
            )
        return body

    def _graphql(self, query: str, variables: Dict[str, Any], what: str, mutation: bool = False) -> Dict[str, Any]:
        resp = self._request("POST", "/graphql", retry=not mutation, json={"query": query, "variables": variables})
        resp = self._check(resp, what)
        body = resp.json()
        if body.get("errors"):
            raise GitHubError(f"{what}: " + "; ".join(e.get("message", "") for e in body["errors"]))
        return body["data"]

    def list_classic_rules(self, org: str, repo: str) -> List[Dict[str, Any]]:
        """Classic branch protection rules (id and pattern).

        Read via GraphQL: a pattern rule such as ``main*`` is reported by the REST
        branch-protection endpoint but cannot be deleted through it.
        """
        data = self._graphql(CLASSIC_RULES_QUERY, {"owner": org, "name": repo},
                             f"list classic rules of {repo}")
        rules = data["repository"]["branchProtectionRules"]
        if rules["pageInfo"]["hasNextPage"]:
            raise GitHubError(f"{repo}: more than 100 classic branch protection rules")
        return [{"id": n["id"], "pattern": n["pattern"]} for n in rules["nodes"]]

    def get_codeowners(self, org: str, repo: str, ref: str) -> Optional[str]:
        for path in CODEOWNERS_PATHS:
            resp = self._request("GET", f"/repos/{org}/{repo}/contents/{path}?ref={ref}")
            if resp.status_code == 404:
                continue
            body = self._check(resp, f"get {path} of {repo}").json()
            return base64.b64decode(body["content"]).decode("utf-8")
        return None

    # -- writes (apply only) -------------------------------------------------

    def create_ruleset(self, org: str, repo: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        resp = self._request("POST", f"/repos/{org}/{repo}/rulesets", json=payload)
        return self._check(resp, f"create ruleset {payload.get('name')} on {repo}").json()

    def update_ruleset(self, org: str, repo: str, ruleset_id: int, payload: Dict[str, Any]) -> None:
        resp = self._request("PUT", f"/repos/{org}/{repo}/rulesets/{ruleset_id}", json=payload)
        self._check(resp, f"update ruleset {ruleset_id} of {repo}")

    def delete_ruleset(self, org: str, repo: str, ruleset_id: int) -> None:
        resp = self._request("DELETE", f"/repos/{org}/{repo}/rulesets/{ruleset_id}")
        self._check(resp, f"delete ruleset {ruleset_id} of {repo}")

    def delete_classic_rule(self, rule_id: str) -> None:
        self._graphql(DELETE_CLASSIC_RULE_MUTATION, {"id": rule_id}, f"delete classic rule {rule_id}", mutation=True)
