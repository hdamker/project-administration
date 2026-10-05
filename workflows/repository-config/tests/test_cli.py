"""Tests for the command line: exit codes, output, confirmation, export."""

import json

import pytest

from scripts.cli import main
from scripts.normalise import normalise

from .fakes import FakeAPI
from .test_planner import make_config


def run(tmp_path, argv, repos, registry, inputs=(), extra_repos=()):
    make_config(tmp_path, registry)
    api = FakeAPI.from_fixtures(repos, extra_repos)
    lines = []
    answers = iter(inputs)
    code = main(
        argv + ["--config-dir", str(tmp_path)],
        api=api,
        out=lines.append,
        ask=lambda prompt: next(answers),
    )
    return code, "\n".join(lines), api


CLEAN_REGISTRY = "repositories:\n  HomeDevicesQoD: {ruleset_class: api-repository, archived: true}\n"
DRIFT_REGISTRY = "repositories:\n  ConnectedNetworkType: {ruleset_class: api-repository}\n"


def test_plan_exit_0_when_clean(tmp_path):
    code, text, _ = run(tmp_path, ["plan"], ["HomeDevicesQoD"], CLEAN_REGISTRY)
    assert code == 0
    assert "1 repositories: 1 clean, 0 with drift, 0 errors" in text


def test_plan_exit_2_on_drift_and_shows_diff(tmp_path):
    code, text, _ = run(tmp_path, ["plan"], ["ConnectedNetworkType"], DRIFT_REGISTRY)
    assert code == 2
    assert "ConnectedNetworkType" in text
    assert "create  release-tag-protection" in text
    assert "update  Codeowner_review_required" in text
    assert '-  "enforcement": "disabled"' in text


def test_plan_exit_1_on_error(tmp_path):
    code, text, _ = run(tmp_path, ["plan", "--repos", "Nope"], ["HomeDevicesQoD"], CLEAN_REGISTRY)
    assert code == 1
    assert "Nope" in text


def test_plan_repos_filter(tmp_path):
    registry = DRIFT_REGISTRY + "  HomeDevicesQoD: {ruleset_class: api-repository, archived: true}\n"
    code, text, _ = run(tmp_path, ["plan", "--repos", "HomeDevicesQoD"], ["ConnectedNetworkType", "HomeDevicesQoD"], registry)
    assert code == 0
    assert "ConnectedNetworkType" not in text


def test_plan_reports_unregistered_repo(tmp_path):
    code, text, _ = run(tmp_path, ["plan"], ["HomeDevicesQoD"], CLEAN_REGISTRY, extra_repos=["Fresh"])
    assert code == 2
    assert "Fresh" in text and "unregistered" in text


def test_plan_writes_markdown_summary(tmp_path):
    summary = tmp_path / "summary.md"
    run(tmp_path, ["plan", "--markdown", str(summary)], ["ConnectedNetworkType"], DRIFT_REGISTRY)
    body = summary.read_text()
    assert "### ConnectedNetworkType" in body
    assert "```diff" in body


def test_apply_requires_repos(tmp_path):
    with pytest.raises(SystemExit):
        run(tmp_path, ["apply"], ["ConnectedNetworkType"], DRIFT_REGISTRY)


def test_apply_asks_for_confirmation_and_can_decline(tmp_path):
    code, text, api = run(tmp_path, ["apply", "--repos", "ConnectedNetworkType"],
                          ["ConnectedNetworkType"], DRIFT_REGISTRY, inputs=["n"])
    assert code == 1
    assert api.calls == []


def test_apply_with_yes_applies_then_plan_is_clean(tmp_path):
    code, text, api = run(tmp_path, ["apply", "--repos", "ConnectedNetworkType", "--yes"],
                          ["ConnectedNetworkType"], DRIFT_REGISTRY)
    assert code == 0
    assert ("create", "ConnectedNetworkType", "release-tag-protection") in api.calls
    assert ("update", "ConnectedNetworkType", "Codeowner_review_required") in api.calls


def test_apply_with_nothing_to_do(tmp_path):
    code, text, api = run(tmp_path, ["apply", "--repos", "HomeDevicesQoD", "--yes"],
                          ["HomeDevicesQoD"], CLEAN_REGISTRY)
    assert code == 0
    assert api.calls == []
    assert "nothing to do" in text


def check_entry(tmp_path, registry, *args):
    make_config(tmp_path, registry)
    lines = []
    code = main(["check-entry", *args, "--config-dir", str(tmp_path)], api=object(), out=lines.append, ask=None)
    return code, "\n".join(lines)


NEW_REPO = "repositories:\n  NewApi: {class: api-repository}\n  SoloApi: {class: api-repository, single_codeowner: true}\n"


def test_check_entry_passes_for_matching_entry(tmp_path):
    code, text = check_entry(tmp_path, NEW_REPO, "--repo", "NewApi", "--class", "api-repository",
                             "--codeowners", "@alice @bob")
    assert code == 0, text


def test_check_entry_single_codeowner(tmp_path):
    code, _ = check_entry(tmp_path, NEW_REPO, "--repo", "SoloApi", "--class", "api-repository", "--codeowners", "@alice")
    assert code == 0
    code, text = check_entry(tmp_path, NEW_REPO, "--repo", "NewApi", "--class", "api-repository", "--codeowners", "@alice")
    assert code == 1
    assert "single_codeowner" in text


def test_check_entry_missing_entry(tmp_path):
    code, text = check_entry(tmp_path, NEW_REPO, "--repo", "Other", "--class", "api-repository", "--codeowners", "@a @b")
    assert code == 1
    assert "no entry" in text


def test_check_entry_wrong_class(tmp_path):
    registry = "repositories:\n  NewApi: {class: non-api}\n"
    code, text = check_entry(tmp_path, registry, "--repo", "NewApi", "--class", "api-repository", "--codeowners", "@a @b")
    assert code == 1
    assert "class" in text


def test_export_writes_normalised_file(tmp_path):
    make_config(tmp_path, CLEAN_REGISTRY)
    api = FakeAPI.from_fixtures(["ConnectedNetworkType"])
    out = tmp_path / "rulesets-out"
    out.mkdir()
    lines = []
    code = main(
        ["export", "--repo", "ConnectedNetworkType", "--ruleset", "Only_Codeowner_Can_Merge",
         "--output-dir", str(out), "--config-dir", str(tmp_path)],
        api=api, out=lines.append, ask=None,
    )
    assert code == 0
    written = json.loads((out / "Only_Codeowner_Can_Merge.json").read_text())
    live = next(r for r in api.state["ConnectedNetworkType"]["rulesets"] if r["name"] == "Only_Codeowner_Can_Merge")
    assert written == normalise(live)
