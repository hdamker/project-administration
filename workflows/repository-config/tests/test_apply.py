"""Tests for apply ordering and the classic-protection guard."""

import pytest

from scripts.github_api import GitHubError
from scripts.planner import apply_plan, plan_all

from .fakes import FakeAPI
from .test_planner import ORG, make_config


def test_apply_orders_writes_then_removes_then_classic(tmp_path):
    cfg = make_config(tmp_path, "repositories:\n  EdgeCloud: {ruleset_class: non-api}\n")
    api = FakeAPI.from_fixtures(["EdgeCloud"])
    plan = plan_all(api, cfg, ORG, only=["EdgeCloud"])[0]
    apply_plan(api, cfg, ORG, plan)
    ops = [c[0] for c in api.calls]
    assert ops == ["create", "create", "delete", "delete", "delete", "delete-classic", "delete-classic"]


def test_classic_protection_kept_unless_declared_rulesets_are_active(tmp_path):
    cfg = make_config(tmp_path, "repositories:\n  ReleaseManagement: {ruleset_class: non-api}\n")
    cfg.rulesets["Only_Codeowner_Can_Merge"]["enforcement"] = "disabled"
    api = FakeAPI.from_fixtures(["ReleaseManagement"])
    plan = plan_all(api, cfg, ORG, only=["ReleaseManagement"])[0]
    with pytest.raises(GitHubError, match="not active: Only_Codeowner_Can_Merge"):
        apply_plan(api, cfg, ORG, plan)
    assert ("delete-classic", "ReleaseManagement", "main*") not in api.calls
    assert api.state["ReleaseManagement"]["classic_rules"]


def test_classic_rule_removed_by_id_and_rechecked(tmp_path):
    cfg = make_config(tmp_path, "repositories:\n  ReleaseManagement: {ruleset_class: non-api}\n")
    api = FakeAPI.from_fixtures(["ReleaseManagement"])
    plan = plan_all(api, cfg, ORG, only=["ReleaseManagement"])[0]
    apply_plan(api, cfg, ORG, plan)
    assert ("delete-classic", "ReleaseManagement", "main*") in api.calls
    assert api.state["ReleaseManagement"]["classic_rules"] == []


def test_classic_rule_still_present_after_delete_is_an_error(tmp_path):
    cfg = make_config(tmp_path, "repositories:\n  ReleaseManagement: {ruleset_class: non-api}\n")
    api = FakeAPI.from_fixtures(["ReleaseManagement"])
    api.ineffective_classic_delete = True
    plan = plan_all(api, cfg, ORG, only=["ReleaseManagement"])[0]
    with pytest.raises(GitHubError, match="still present: main\\*"):
        apply_plan(api, cfg, ORG, plan)


def test_legacy_release_rule_replaced_by_the_legacy_ruleset(tmp_path):
    cfg = make_config(tmp_path, "repositories:\n  EdgeCloud: {ruleset_class: non-api, legacy_releases: true}\n")
    api = FakeAPI.from_fixtures(["EdgeCloud"])
    plan = plan_all(api, cfg, ORG, only=["EdgeCloud"])[0]
    apply_plan(api, cfg, ORG, plan)
    assert api.state["EdgeCloud"]["classic_rules"] == []
    assert "legacy-release-protection" in {r["name"] for r in api.state["EdgeCloud"]["rulesets"]}
    assert not plan_all(api, cfg, ORG, only=["EdgeCloud"])[0].drift


def test_legacy_release_rule_kept_unless_the_legacy_ruleset_is_active(tmp_path):
    cfg = make_config(tmp_path, "repositories:\n  EdgeCloud: {ruleset_class: non-api, legacy_releases: true}\n")
    cfg.rulesets["legacy-release-protection"]["enforcement"] = "evaluate"
    api = FakeAPI.from_fixtures(["EdgeCloud"])
    plan = plan_all(api, cfg, ORG, only=["EdgeCloud"])[0]
    with pytest.raises(GitHubError, match="not active: legacy-release-protection"):
        apply_plan(api, cfg, ORG, plan)
    assert len(api.state["EdgeCloud"]["classic_rules"]) == 2


def test_apply_uses_the_declared_payload(tmp_path):
    cfg = make_config(tmp_path, "repositories:\n  ConnectedNetworkType: {ruleset_class: api-repository}\n")
    api = FakeAPI.from_fixtures(["ConnectedNetworkType"])
    plan = plan_all(api, cfg, ORG, only=["ConnectedNetworkType"])[0]
    apply_plan(api, cfg, ORG, plan)
    live = {r["name"]: r for r in api.state["ConnectedNetworkType"]["rulesets"]}
    assert live["Codeowner_review_required"]["enforcement"] == "active"
    assert "release-tag-protection" in live
