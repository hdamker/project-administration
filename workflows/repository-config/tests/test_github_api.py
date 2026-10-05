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


def test_classic_protection_absent_is_none():
    resp = FakeResponse(404, {"message": "Branch not protected"})
    gh, _ = api({("GET", "/repos/o/r/branches/main/protection"): resp})
    assert gh.get_classic_protection("o", "r", "main") is None


def test_classic_protection_on_missing_repo_is_an_error():
    resp = FakeResponse(404, {"message": "Not Found"})
    gh, _ = api({("GET", "/repos/o/r/branches/main/protection"): resp})
    with pytest.raises(RepoNotFound):
        gh.get_classic_protection("o", "r", "main")


def test_classic_protection_present():
    body = {"required_pull_request_reviews": {"required_approving_review_count": 1}}
    gh, _ = api({("GET", "/repos/o/r/branches/main/protection"): FakeResponse(200, body)})
    assert gh.get_classic_protection("o", "r", "main") == body


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


def test_update_and_delete_ruleset_and_classic():
    gh, session = api({
        ("PUT", "/repos/o/r/rulesets/3"): FakeResponse(200, {}),
        ("DELETE", "/repos/o/r/rulesets/3"): FakeResponse(204),
        ("DELETE", "/repos/o/r/branches/main/protection"): FakeResponse(204),
    })
    gh.update_ruleset("o", "r", 3, {"name": "x"})
    gh.delete_ruleset("o", "r", 3)
    gh.delete_classic_protection("o", "r", "main")
    assert [c[0] for c in session.calls] == ["PUT", "DELETE", "DELETE"]


def test_error_status_raises_with_message():
    gh, _ = api({("DELETE", "/repos/o/r/rulesets/3"): FakeResponse(403, {"message": "Must have admin rights"})})
    with pytest.raises(GitHubError, match="Must have admin rights"):
        gh.delete_ruleset("o", "r", 3)
