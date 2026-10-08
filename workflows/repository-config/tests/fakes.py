"""In-memory stand-in for GitHubAPI, built from recorded responses."""

import copy
import json
from pathlib import Path

from scripts.github_api import RepoNotFound

REPO_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "repos"


class FakeAPI:
    """Same read/write surface as GitHubAPI; writes mutate state and are logged."""

    def __init__(self, repos, extra_repos=()):
        # repos: name -> fixture dict; extra_repos: bare names with no rulesets
        self.state = {name: copy.deepcopy(data) for name, data in repos.items()}
        for name in extra_repos:
            self.state[name] = {
                "repo": {"name": name, "archived": False, "default_branch": "main"},
                "rulesets": [],
                "classic_rules": [],
                "codeowners": "* @a @b\n",
            }
        self.calls = []
        self._next_id = 9_000_000
        # Simulates a delete that reports success but leaves the rule in place.
        self.ineffective_classic_delete = False

    @classmethod
    def from_fixtures(cls, names, extra_repos=()):
        repos = {n: json.loads((REPO_FIXTURES / f"{n}.json").read_text()) for n in names}
        return cls(repos, extra_repos)

    def _repo(self, repo):
        if repo not in self.state:
            raise RepoNotFound(repo)
        return self.state[repo]

    # reads
    def list_org_repos(self, org):
        return [dict(d["repo"]) for d in self.state.values()]

    def get_repo(self, org, repo):
        return dict(self._repo(repo)["repo"])

    def list_rulesets(self, org, repo):
        return [
            {"id": r["id"], "name": r["name"], "target": r["target"], "enforcement": r["enforcement"]}
            for r in self._repo(repo)["rulesets"]
        ]

    def get_ruleset(self, org, repo, ruleset_id):
        for r in self._repo(repo)["rulesets"]:
            if r["id"] == ruleset_id:
                return copy.deepcopy(r)
        raise RepoNotFound(f"ruleset {ruleset_id}")

    def list_classic_rules(self, org, repo):
        return [{"id": r["id"], "pattern": r["pattern"]} for r in self._repo(repo)["classic_rules"]]

    def get_codeowners(self, org, repo, ref):
        return self._repo(repo)["codeowners"]

    # writes
    def create_ruleset(self, org, repo, payload):
        self.calls.append(("create", repo, payload["name"]))
        self._next_id += 1
        self._repo(repo)["rulesets"].append({**copy.deepcopy(payload), "id": self._next_id, "source_type": "Repository"})
        return {"id": self._next_id}

    def update_ruleset(self, org, repo, ruleset_id, payload):
        self.calls.append(("update", repo, payload["name"]))
        rulesets = self._repo(repo)["rulesets"]
        for i, r in enumerate(rulesets):
            if r["id"] == ruleset_id:
                rulesets[i] = {**copy.deepcopy(payload), "id": ruleset_id, "source_type": "Repository"}
                return
        raise RepoNotFound(f"ruleset {ruleset_id}")

    def delete_ruleset(self, org, repo, ruleset_id):
        rulesets = self._repo(repo)["rulesets"]
        name = next(r["name"] for r in rulesets if r["id"] == ruleset_id)
        self.calls.append(("delete", repo, name))
        self._repo(repo)["rulesets"] = [r for r in rulesets if r["id"] != ruleset_id]

    def delete_classic_rule(self, rule_id):
        for name, data in self.state.items():
            for rule in data["classic_rules"]:
                if rule["id"] == rule_id:
                    self.calls.append(("delete-classic", name, rule["pattern"]))
                    if not self.ineffective_classic_delete:
                        data["classic_rules"] = [r for r in data["classic_rules"] if r["id"] != rule_id]
                    return
        raise RepoNotFound(f"classic rule {rule_id}")
