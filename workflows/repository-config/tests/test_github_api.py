"""Tests for the GitHub client, against a scripted session."""

import base64
import json

import pytest

from scripts.github_api import (
    GitHubAPI,
    GitHubError,
    MissingBypassActors,
    RepoNotFound,
)


class FakeResponse:
    def __init__(self, status=200, body=None, headers=None):
        self.status_code = status
        self._body = body
        self.headers = headers or {}
        self.text = json.dumps(body) if body is not None else ""

    def json(self):
        return self._body

    @property
    def ok(self):
        return self.status_code < 400


class FakeSession:
    """Maps (method, path) to a response or a list of responses served in order."""

    def __init__(self, routes):
        self.routes = routes
        self.calls = []
        self.headers = {}

    def request(self, method, url, **kwargs):
        path = url.replace("https://api.github.com", "")
        self.calls.append((method, path, kwargs))
        key = (method, path)
        if key not in self.routes:
            raise AssertionError(f"unexpected call {key}")
        value = self.routes[key]
        if isinstance(value, list):
            return value.pop(0)
        return value


def api(routes):
    session = FakeSession(routes)
    return GitHubAPI(token="t", session=session, sleep=lambda s: None), session


def test_get_ruleset_returns_full_body():
    body = {"id": 1, "name": "x", "bypass_actors": []}
    gh, _ = api({("GET", "/repos/o/r/rulesets/1"): FakeResponse(200, body)})
    assert gh.get_ruleset("o", "r", 1) == body


def test_get_ruleset_without_bypass_actors_is_an_error():
    body = {"id": 1, "name": "x"}
    gh, _ = api({("GET", "/repos/o/r/rulesets/1"): FakeResponse(200, body)})
    with pytest.raises(MissingBypassActors):
        gh.get_ruleset("o", "r", 1)


def test_list_rulesets_follows_pagination():
    page1 = FakeResponse(200, [{"id": 1}], {"Link": '<https://api.github.com/repos/o/r/rulesets?page=2>; rel="next"'})
    page2 = FakeResponse(200, [{"id": 2}])
    gh, _ = api({
        ("GET", "/repos/o/r/rulesets?per_page=100"): page1,
        ("GET", "/repos/o/r/rulesets?page=2"): page2,
    })
    assert [r["id"] for r in gh.list_rulesets("o", "r")] == [1, 2]


def graphql_rules(nodes, has_next=False):
    return FakeResponse(200, {"data": {"repository": {"branchProtectionRules": {
        "pageInfo": {"hasNextPage": has_next}, "nodes": nodes}}}})


def test_classic_rules_are_read_via_graphql():
    nodes = [
        {"id": "BPR_1", "pattern": "main*", "matchingRefs": {"nodes": [{"name": "main"}]}},
        {"id": "BPR_2", "pattern": "*release*", "matchingRefs": {"nodes": []}},
    ]
    gh, session = api({("POST", "/graphql"): graphql_rules(nodes)})
    assert gh.list_classic_rules("o", "r", "main") == [
        {"id": "BPR_1", "pattern": "main*", "matching_refs": ["main"]},
        {"id": "BPR_2", "pattern": "*release*", "matching_refs": []},
    ]
    variables = session.calls[0][2]["json"]["variables"]
    assert variables == {"owner": "o", "name": "r", "branch": "main"}


def test_no_classic_rules():
    gh, _ = api({("POST", "/graphql"): graphql_rules([])})
    assert gh.list_classic_rules("o", "r", "main") == []


def test_classic_rules_missing_repo_is_an_error():
    body = {"data": {"repository": None}, "errors": [{"type": "NOT_FOUND", "message": "Could not resolve"}]}
    gh, _ = api({("POST", "/graphql"): FakeResponse(200, body)})
    with pytest.raises(GitHubError, match="Could not resolve"):
        gh.list_classic_rules("o", "r", "main")


def test_more_than_one_page_of_classic_rules_is_an_error():
    gh, _ = api({("POST", "/graphql"): graphql_rules([], has_next=True)})
    with pytest.raises(GitHubError, match="more than"):
        gh.list_classic_rules("o", "r", "main")


def test_delete_classic_rule_uses_the_mutation():
    body = {"data": {"deleteBranchProtectionRule": {"clientMutationId": None}}}
    gh, session = api({("POST", "/graphql"): FakeResponse(200, body)})
    gh.delete_classic_rule("BPR_1")
    request = session.calls[0][2]["json"]
    assert "deleteBranchProtectionRule" in request["query"]
    assert request["variables"] == {"id": "BPR_1"}


def test_delete_classic_rule_graphql_error():
    body = {"data": None, "errors": [{"message": "Must have admin rights"}]}
    gh, _ = api({("POST", "/graphql"): FakeResponse(200, body)})
    with pytest.raises(GitHubError, match="Must have admin rights"):
        gh.delete_classic_rule("BPR_1")


def test_codeowners_search_order_and_decoding():
    content = base64.b64encode(b"* @alice\n").decode()
    gh, session = api({
        ("GET", "/repos/o/r/contents/.github/CODEOWNERS?ref=main"): FakeResponse(404, {"message": "Not Found"}),
        ("GET", "/repos/o/r/contents/CODEOWNERS?ref=main"): FakeResponse(200, {"content": content, "encoding": "base64"}),
    })
    assert gh.get_codeowners("o", "r", "main") == "* @alice\n"
    assert [c[1] for c in session.calls] == [
        "/repos/o/r/contents/.github/CODEOWNERS?ref=main",
        "/repos/o/r/contents/CODEOWNERS?ref=main",
    ]


def test_codeowners_missing_everywhere_is_none():
    nf = lambda: FakeResponse(404, {"message": "Not Found"})
    gh, _ = api({
        ("GET", "/repos/o/r/contents/.github/CODEOWNERS?ref=main"): nf(),
        ("GET", "/repos/o/r/contents/CODEOWNERS?ref=main"): nf(),
        ("GET", "/repos/o/r/contents/docs/CODEOWNERS?ref=main"): nf(),
    })
    assert gh.get_codeowners("o", "r", "main") is None


def test_transient_error_is_retried():
    routes = {("GET", "/repos/o/r"): [FakeResponse(503, {}), FakeResponse(200, {"name": "r"})]}
    gh, session = api(routes)
    assert gh.get_repo("o", "r") == {"name": "r"}
    assert len(session.calls) == 2


def test_writes_are_not_retried():
    """A retried write can repeat one that already succeeded behind the 5xx."""
    gh, session = api({
        ("POST", "/repos/o/r/rulesets"): [FakeResponse(502, {}), FakeResponse(201, {"id": 9})],
        ("DELETE", "/repos/o/r/rulesets/3"): [FakeResponse(503, {}), FakeResponse(204)],
    })
    with pytest.raises(GitHubError, match="HTTP 502"):
        gh.create_ruleset("o", "r", {"name": "x"})
    with pytest.raises(GitHubError, match="HTTP 503"):
        gh.delete_ruleset("o", "r", 3)
    assert len(session.calls) == 2


def test_graphql_query_is_retried_but_mutation_is_not():
    nodes = graphql_rules([]).json()
    gh, session = api({("POST", "/graphql"): [FakeResponse(503, {}), FakeResponse(200, nodes)]})
    assert gh.list_classic_rules("o", "r", "main") == []
    assert len(session.calls) == 2

    gh, session = api({("POST", "/graphql"): [FakeResponse(502, {}), FakeResponse(200, {"data": {}})]})
    with pytest.raises(GitHubError, match="HTTP 502"):
        gh.delete_classic_rule("BPR_1")
    assert len(session.calls) == 1


def test_rate_limit_raises():
    resp = FakeResponse(403, {"message": "API rate limit exceeded"}, {"X-RateLimit-Remaining": "0"})
    gh, _ = api({("GET", "/repos/o/r"): resp})
    with pytest.raises(GitHubError, match="rate limit"):
        gh.get_repo("o", "r")


def test_create_ruleset_posts_payload():
    payload = {"name": "x", "bypass_actors": []}
    gh, session = api({("POST", "/repos/o/r/rulesets"): FakeResponse(201, {"id": 9})})
    gh.create_ruleset("o", "r", payload)
    assert session.calls[0][2]["json"] == payload


def test_update_and_delete_ruleset():
    gh, session = api({
        ("PUT", "/repos/o/r/rulesets/3"): FakeResponse(200, {}),
        ("DELETE", "/repos/o/r/rulesets/3"): FakeResponse(204),
    })
    gh.update_ruleset("o", "r", 3, {"name": "x"})
    gh.delete_ruleset("o", "r", 3)
    assert [c[0] for c in session.calls] == ["PUT", "DELETE"]


def test_error_status_raises_with_message():
    gh, _ = api({("DELETE", "/repos/o/r/rulesets/3"): FakeResponse(403, {"message": "Must have admin rights"})})
    with pytest.raises(GitHubError, match="Must have admin rights"):
        gh.delete_ruleset("o", "r", 3)
