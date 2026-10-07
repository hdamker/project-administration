"""Tests for ruleset normalisation."""

import copy

from scripts.normalise import VOLATILE_KEYS, normalise


def test_drops_volatile_fields(live_ruleset):
    result = normalise(live_ruleset)
    for key in VOLATILE_KEYS:
        assert key not in result
    assert result["name"] == "release-snapshot-protection"
    assert result["enforcement"] == "active"


def test_does_not_mutate_input(live_ruleset):
    original = copy.deepcopy(live_ruleset)
    normalise(live_ruleset)
    assert live_ruleset == original


def test_sorts_rules_by_type(live_ruleset):
    result = normalise(live_ruleset)
    types = [r["type"] for r in result["rules"]]
    assert types == sorted(types)


def test_sorts_bypass_actors_by_type_then_id(live_ruleset):
    live_ruleset["bypass_actors"] = [
        {"actor_id": 2865881, "actor_type": "Integration", "bypass_mode": "always"},
        {"actor_id": None, "actor_type": "OrganizationAdmin", "bypass_mode": "always"},
        {"actor_id": 5, "actor_type": "Integration", "bypass_mode": "always"},
    ]
    result = normalise(live_ruleset)
    assert [(a["actor_type"], a["actor_id"]) for a in result["bypass_actors"]] == [
        ("Integration", 5),
        ("Integration", 2865881),
        ("OrganizationAdmin", None),
    ]


def test_rule_order_does_not_matter(live_ruleset):
    shuffled = copy.deepcopy(live_ruleset)
    shuffled["rules"].reverse()
    assert normalise(shuffled) == normalise(live_ruleset)


def test_keeps_everything_else_exactly(live_ruleset):
    result = normalise(live_ruleset)
    pr = next(r for r in result["rules"] if r["type"] == "pull_request")
    assert pr["parameters"]["require_extra_approval_for_unattributed_changes"] is True
    assert result["conditions"]["ref_name"]["include"] == ["refs/heads/release-snapshot/**"]
