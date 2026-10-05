"""Tests for apply ordering and the classic-protection guard."""

import pytest

from scripts.github_api import GitHubError
from scripts.planner import apply_plan, plan_all

from .fakes import FakeAPI
from .test_planner import ORG, make_config


def test_apply_orders_writes_then_removes_then_classic(tmp_path):
    cfg = make_config(tmp_path, "repositories:\n  EdgeCloud: {class: non-api}\n")
    api = FakeAPI.from_fixtures(["EdgeCloud"])
    plan = plan_all(api, cfg, ORG, only=["EdgeCloud"])[0]
    apply_plan(api, cfg, ORG, plan)
    ops = [c[0] for c in api.calls]
    assert ops == ["create", "create", "delete", "delete", "delete", "delete-classic"]


def test_classic_protection_kept_unless_main_rulesets_are_active(tmp_path):
    cfg = make_config(tmp_path, "repositories:\n  ReleaseManagement: {class: non-api}\n")
    cfg.rulesets["Only_Codeowner_Can_Merge"]["enforcement"] = "disabled"
    api = FakeAPI.from_fixtures(["ReleaseManagement"])
    plan = plan_all(api, cfg, ORG, only=["ReleaseManagement"])[0]
    with pytest.raises(GitHubError, match="not active: Only_Codeowner_Can_Merge"):
        apply_plan(api, cfg, ORG, plan)
    assert ("delete-classic", "ReleaseManagement", "main") not in api.calls
    assert api.state["ReleaseManagement"]["protection"] is not None


def test_apply_uses_the_declared_payload(tmp_path):
    cfg = make_config(tmp_path, "repositories:\n  ConnectedNetworkType: {class: api-repository}\n")
    api = FakeAPI.from_fixtures(["ConnectedNetworkType"])
    plan = plan_all(api, cfg, ORG, only=["ConnectedNetworkType"])[0]
    apply_plan(api, cfg, ORG, plan)
    live = {r["name"]: r for r in api.state["ConnectedNetworkType"]["rulesets"]}
    assert live["Codeowner_review_required"]["enforcement"] == "active"
    assert "release-tag-protection" in live
