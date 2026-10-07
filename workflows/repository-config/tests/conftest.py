"""Shared fixtures for repository-config tests."""

import copy
import json
import sys
from pathlib import Path

import pytest

# Ensure the scripts package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def load_fixture(name):
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture
def live_ruleset():
    """A ruleset as GET /repos/{r}/rulesets/{id} returns it (volatile fields included)."""
    return copy.deepcopy(load_fixture("live_release_snapshot_protection.json"))
