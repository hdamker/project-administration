"""Tests for the plan: one case per rule, over recorded responses."""

import shutil

import pytest

from scripts.config import DEFAULT_CONFIG_DIR, load_config
from scripts.planner import plan_all, plan_repo

from .fakes import FakeAPI

ORG = "camaraproject"


def make_config(tmp_path, registry_yaml):
    """The shipped classes and rulesets with a test registry."""
    shutil.copytree(DEFAULT_CONFIG_DIR / "rulesets", tmp_path / "rulesets", dirs_exist_ok=True)
    shutil.copy(DEFAULT_CONFIG_DIR / "ruleset-classes.yaml", tmp_path)
    (tmp_path / "repositories.yaml").write_text(registry_yaml)
    return load_config(tmp_path)


def kinds(plan):
    return sorted((a.kind, a.ruleset) for a in plan.actions)


def one(plan, kind, ruleset):
    found = [a for a in plan.actions if a.kind == kind and a.ruleset == ruleset]
    assert len(found) == 1, f"{kind} {ruleset} in {kinds(plan)}"
    return found[0]


def plan_one(tmp_path, name, registry_yaml):
    cfg = make_config(tmp_path, registry_yaml)
    api = FakeAPI.from_fixtures([name])
    return plan_all(api, cfg, ORG, only=[name])[0]


def test_clean_repo_only_misses_tag_protection(tmp_path):
    plan = plan_one(tmp_path, "ApplicationEndpointDiscovery",
                    "repositories:\n  ApplicationEndpointDiscovery: {ruleset_class: api-repository}\n")
    assert kinds(plan) == [("create", "release-tag-protection")]
    assert plan.findings == []
    assert plan.drift


def test_stale_disabled_ruleset_is_an_update_with_diff(tmp_path):
    plan = plan_one(tmp_path, "ConnectedNetworkType",
                    "repositories:\n  ConnectedNetworkType: {ruleset_class: api-repository}\n")
    update = one(plan, "update", "Codeowner_review_required")
    assert '-  "enforcement": "disabled"' in update.diff
    assert '+  "enforcement": "active"' in update.diff
    assert kinds(plan) == [("create", "release-tag-protection"), ("update", "Codeowner_review_required")]


def test_single_codeowner_repo_has_no_second_ruleset(tmp_path):
    plan = plan_one(tmp_path, "SponsoredData",
                    "repositories:\n  SponsoredData: {ruleset_class: api-repository, single_codeowner: true}\n")
    assert one(plan, "remove", "Codeowner_review_required").ruleset_id == 8441211
    assert plan.findings == []


def test_single_codeowner_flag_cross_checked_against_codeowners(tmp_path):
    # CODEOWNERS has one owner, the registry says several
    plan = plan_one(tmp_path, "SponsoredData",
                    "repositories:\n  SponsoredData: {ruleset_class: api-repository}\n")
    assert any("single_codeowner" in f for f in plan.findings)
    # and the other way round
    plan = plan_one(tmp_path, "ApplicationEndpointDiscovery",
                    "repositories:\n  ApplicationEndpointDiscovery: {ruleset_class: api-repository, single_codeowner: true}\n")
    assert any("single_codeowner" in f for f in plan.findings)


def test_other_class_rulesets_are_removed_and_main_rulesets_created(tmp_path):
    plan = plan_one(tmp_path, "EdgeCloud", "repositories:\n  EdgeCloud: {ruleset_class: non-api}\n")
    for name in ("release-snapshot-protection", "release-pointer-protection", "pre-release-pointer-protection"):
        assert one(plan, "remove", name)
    assert one(plan, "create", "Only_Codeowner_Can_Merge")
    assert one(plan, "create", "Codeowner_review_required")


def test_every_classic_rule_is_removed(tmp_path):
    plan = plan_one(tmp_path, "EdgeCloud", "repositories:\n  EdgeCloud: {ruleset_class: non-api}\n")
    classic = [a for a in plan.actions if a.kind == "remove-classic-protection"]
    assert sorted((a.pattern, a.classic_rule_id) for a in classic) == [
        ("*release*", "BPR_kwDOHNiXdc4CMfHs"),
        ("main*", "BPR_kwDOHNiXdc4B3wPw"),
    ]


def test_legacy_releases_flag_adds_the_legacy_ruleset(tmp_path):
    plan = plan_one(tmp_path, "EdgeCloud",
                    "repositories:\n  EdgeCloud: {ruleset_class: non-api, legacy_releases: true}\n")
    assert one(plan, "create", "legacy-release-protection")
    plan = plan_one(tmp_path, "EdgeCloud", "repositories:\n  EdgeCloud: {ruleset_class: non-api}\n")
    assert not [a for a in plan.actions if a.ruleset == "legacy-release-protection"]


def test_legacy_ruleset_removed_without_the_flag(tmp_path):
    cfg = make_config(tmp_path, "repositories:\n  ApplicationEndpointDiscovery: {ruleset_class: api-repository}\n")
    api = FakeAPI.from_fixtures(["ApplicationEndpointDiscovery"])
    api.create_ruleset(ORG, "ApplicationEndpointDiscovery", cfg.rulesets["legacy-release-protection"])
    plan = plan_all(api, cfg, ORG, only=["ApplicationEndpointDiscovery"])[0]
    assert one(plan, "remove", "legacy-release-protection").reason == "not declared for this repository"


def test_unmanaged_names_are_listed_and_untouched(tmp_path):
    plan = plan_one(tmp_path, "ConnectivityQualityManagement",
                    "repositories:\n  ConnectivityQualityManagement: {ruleset_class: non-api}\n")
    unmanaged = one(plan, "unmanaged", "code-owner-review-required-with-write-permission-bypass")
    assert unmanaged.ruleset_id
    assert ("create", "Only_Codeowner_Can_Merge") in kinds(plan)


def test_classic_only_repo(tmp_path):
    plan = plan_one(tmp_path, "SimSwap", "repositories:\n  SimSwap: {ruleset_class: api-repository}\n")
    assert kinds(plan) == [
        ("create", "Codeowner_review_required"),
        ("create", "Only_Codeowner_Can_Merge"),
        ("create", "release-tag-protection"),
        ("remove-classic-protection", None),
        ("remove-classic-protection", None),
    ]


def test_zero_rulesets_and_classic(tmp_path):
    plan = plan_one(tmp_path, "ReleaseManagement", "repositories:\n  ReleaseManagement: {ruleset_class: non-api}\n")
    assert kinds(plan) == [
        ("create", "Codeowner_review_required"),
        ("create", "Only_Codeowner_Can_Merge"),
        ("remove-classic-protection", None),
    ]


def test_retired_ruleset_is_removed(tmp_path):
    plan = plan_one(tmp_path, "ReleaseTest",
                    "repositories:\n  ReleaseTest: {ruleset_class: api-repository, single_codeowner: true}\n")
    assert one(plan, "remove", "code-owner-review-required-or-sole-codeowner")
    assert one(plan, "create", "Only_Codeowner_Can_Merge")
    assert not [a for a in plan.actions if a.ruleset == "Codeowner_review_required"]
    assert not [a for a in plan.actions if a.ruleset == "release-tag-protection"]


def test_archived_repo_is_skipped(tmp_path):
    plan = plan_one(tmp_path, "HomeDevicesQoD",
                    "repositories:\n  HomeDevicesQoD: {ruleset_class: api-repository, archived: true}\n")
    assert plan.actions == []
    assert plan.skipped == "archived"
    assert not plan.drift


def test_archived_flag_mismatch_is_drift(tmp_path):
    plan = plan_one(tmp_path, "HomeDevicesQoD", "repositories:\n  HomeDevicesQoD: {ruleset_class: api-repository}\n")
    assert any("archived" in f for f in plan.findings)
    assert plan.drift


def test_unmanaged_class_is_not_touched(tmp_path):
    plan = plan_one(tmp_path, "EdgeCloud", "repositories:\n  EdgeCloud: {ruleset_class: unmanaged}\n")
    assert plan.actions == []
    assert not plan.drift


def test_unregistered_and_missing_repos_are_drift(tmp_path):
    cfg = make_config(tmp_path, "repositories:\n  Gone: {ruleset_class: non-api}\n  Known: {ruleset_class: unmanaged}\n")
    api = FakeAPI({}, extra_repos=["Known", "Fresh"])
    plans = {p.repo: p for p in plan_all(api, cfg, ORG)}
    assert plans["Fresh"].findings == ["unregistered"]
    assert plans["Gone"].findings == ["registered but not found on GitHub"]
    assert not plans["Known"].drift


def test_named_repos_are_looked_up_directly(tmp_path):
    """A just-created repository may be missing from the organisation listing."""
    cfg = make_config(tmp_path, "repositories:\n  ReleaseManagement: {ruleset_class: non-api}\n")
    api = FakeAPI.from_fixtures(["ReleaseManagement"])
    api.list_org_repos = lambda org: []
    plan = plan_all(api, cfg, ORG, only=["ReleaseManagement"])[0]
    assert plan.findings == []
    assert ("create", "Only_Codeowner_Can_Merge") in kinds(plan)


def test_plan_after_apply_is_clean(tmp_path):
    cfg = make_config(tmp_path, "repositories:\n  EdgeCloud: {ruleset_class: non-api}\n")
    api = FakeAPI.from_fixtures(["EdgeCloud"])
    plan = plan_all(api, cfg, ORG, only=["EdgeCloud"])[0]
    assert plan.drift
    from scripts.planner import apply_plan
    apply_plan(api, cfg, ORG, plan)
    assert not plan_all(api, cfg, ORG, only=["EdgeCloud"])[0].drift


def test_bypass_actors_missing_is_an_error_not_a_diff(tmp_path):
    from scripts.github_api import MissingBypassActors

    cfg = make_config(tmp_path, "repositories:\n  ApplicationEndpointDiscovery: {ruleset_class: api-repository}\n")
    api = FakeAPI.from_fixtures(["ApplicationEndpointDiscovery"])

    def broken(org, repo, ruleset_id):
        raise MissingBypassActors("no write access")

    api.get_ruleset = broken
    plan = plan_all(api, cfg, ORG, only=["ApplicationEndpointDiscovery"])[0]
    assert "no write access" in plan.error
    assert plan.actions == []


def test_round_trip_export_then_plan_has_no_drift(tmp_path):
    """A declared file exported from a live ruleset matches that live ruleset."""
    cfg = make_config(tmp_path, "repositories:\n  ApplicationEndpointDiscovery: {ruleset_class: api-repository}\n")
    api = FakeAPI.from_fixtures(["ApplicationEndpointDiscovery"])
    plan = plan_repo(api, cfg, ORG, cfg.registry["ApplicationEndpointDiscovery"],
                     api.get_repo(ORG, "ApplicationEndpointDiscovery"))
    assert not [a for a in plan.actions if a.kind in ("update", "remove")]
    assert not [a for a in plan.actions if a.ruleset and a.ruleset.startswith("release-") and a.kind == "update"]
