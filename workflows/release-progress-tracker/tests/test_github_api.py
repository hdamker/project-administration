"""Tests for GitHub API client fallback behavior."""

from scripts.github_api import GitHubAPI


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload
        self.headers = {"X-RateLimit-Remaining": "100"}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def test_find_release_issue_retries_public_when_auth_returns_empty(monkeypatch):
    api = GitHubAPI(token="test-token")
    calls = []

    def fake_get(path, public=False, **kwargs):
        calls.append(public)
        if not public:
            return FakeResponse(200, [])
        return FakeResponse(200, [{
            "number": 43,
            "html_url": "https://github.com/camaraproject/ReleaseTest/issues/43",
            "body": (
                "<!-- release-automation:workflow-owned -->\n"
                "<!-- release-automation:release-tag:r1.3 -->\n"
                "**State:** `draft-ready`"
            ),
            "labels": [{"name": "release-issue"}],
        }])

    monkeypatch.setattr(api, "_get", fake_get)

    issue = api.find_release_issue("ReleaseTest", "r1.3")

    assert calls == [False, True]
    assert issue == {
        "number": 43,
        "url": "https://github.com/camaraproject/ReleaseTest/issues/43",
        "body": (
            "<!-- release-automation:workflow-owned -->\n"
            "<!-- release-automation:release-tag:r1.3 -->\n"
            "**State:** `draft-ready`"
        ),
        "labels": ["release-issue"],
    }
