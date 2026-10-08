"""Tests for loading the declared configuration."""

import json
import textwrap

import pytest

from scripts.config import ConfigError, load_config
from scripts.normalise import normalise


def write_config(tmp_path, classes=None, repositories=None, rulesets=None):
    (tmp_path / "rulesets").mkdir()
    for name, body in (rulesets or {"a": {"name": "a", "rules": [], "bypass_actors": []}}).items():
        (tmp_path / "rulesets" / f"{name}.json").write_text(json.dumps(body))
    (tmp_path / "ruleset-classes.yaml").write_text(textwrap.dedent(classes or """
        ruleset_classes:
          api-repository:
            rulesets: [a]
        single_codeowner_excludes: []
        retired: [old]
    """))
    (tmp_path / "repositories.yaml").write_text(textwrap.dedent(repositories or """
        repositories:
          R1:
            ruleset_class: api-repository
          R2:
            ruleset_class: unmanaged
    """))
    return tmp_path


def test_loads_rulesets_classes_and_registry(tmp_path):
    cfg = load_config(write_config(tmp_path))
    assert cfg.rulesets["a"]["name"] == "a"
    assert cfg.ruleset_classes == {"api-repository": ["a"]}
    assert cfg.retired == ["old"]
    assert cfg.registry["R1"].ruleset_class == "api-repository"
    assert cfg.registry["R1"].single_codeowner is False
    assert cfg.registry["R1"].archived is False


def test_registry_flags(tmp_path):
    cfg = load_config(write_config(tmp_path, repositories="""
        repositories:
          R1: {ruleset_class: api-repository, single_codeowner: true, archived: true}
    """))
    assert cfg.registry["R1"].single_codeowner is True
    assert cfg.registry["R1"].archived is True


def test_declared_rulesets_are_normalised(tmp_path):
    body = {"name": "a", "id": 5, "rules": [{"type": "z"}, {"type": "b"}], "bypass_actors": []}
    cfg = load_config(write_config(tmp_path, rulesets={"a": body}))
    assert cfg.rulesets["a"] == normalise(body)


def test_unknown_class_in_registry(tmp_path):
    with pytest.raises(ConfigError, match="R1.*unknown ruleset_class"):
        load_config(write_config(tmp_path, repositories="repositories:\n  R1: {ruleset_class: nope}\n"))


def test_class_references_missing_ruleset_file(tmp_path):
    with pytest.raises(ConfigError, match="missing.*no file"):
        load_config(write_config(tmp_path, classes="""
            ruleset_classes:
              api-repository:
                rulesets: [missing]
            single_codeowner_excludes: []
            retired: []
        """))


def test_ruleset_name_must_match_filename(tmp_path):
    with pytest.raises(ConfigError, match="name 'b' differs from file 'a'"):
        load_config(write_config(tmp_path, rulesets={"a": {"name": "b", "rules": [], "bypass_actors": []}}))


def test_declared_ruleset_cannot_be_retired(tmp_path):
    with pytest.raises(ConfigError, match="retired"):
        load_config(write_config(tmp_path, classes="""
            ruleset_classes:
              api-repository:
                rulesets: [a]
            single_codeowner_excludes: []
            retired: [a]
        """))


def test_ruleset_without_bypass_actors_is_rejected(tmp_path):
    with pytest.raises(ConfigError, match="bypass_actors"):
        load_config(write_config(tmp_path, rulesets={"a": {"name": "a", "rules": []}}))


def test_shipped_config_loads():
    """The repository's own config/ stays consistent."""
    from scripts.config import DEFAULT_CONFIG_DIR

    cfg = load_config(DEFAULT_CONFIG_DIR)
    assert "release-tag-protection" in cfg.ruleset_classes["api-repository"]
    assert "release-tag-protection" not in cfg.ruleset_classes["non-api"]


FLAGGED = """
    ruleset_classes:
      api-repository:
        rulesets: [a]
    flag_rulesets:
      legacy_releases: [legacy]
    single_codeowner_excludes: []
    retired: []
"""


def test_flag_ruleset_added_when_flag_is_set(tmp_path):
    body = lambda n: {"name": n, "rules": [], "bypass_actors": []}
    cfg = load_config(write_config(tmp_path, classes=FLAGGED, rulesets={"a": body("a"), "legacy": body("legacy")},
                                   repositories="""
        repositories:
          Old: {ruleset_class: api-repository, legacy_releases: true}
          New: {ruleset_class: api-repository}
    """))
    assert cfg.registry["Old"].legacy_releases is True
    assert cfg.desired_rulesets(cfg.registry["Old"]) == ["a", "legacy"]
    assert cfg.desired_rulesets(cfg.registry["New"]) == ["a"]


def test_flag_ruleset_needs_a_file(tmp_path):
    with pytest.raises(ConfigError, match="flag legacy_releases: ruleset 'legacy' has no file"):
        load_config(write_config(tmp_path, classes=FLAGGED))


def test_unknown_flag(tmp_path):
    classes = FLAGGED.replace("legacy_releases:", "other_flag:")
    body = lambda n: {"name": n, "rules": [], "bypass_actors": []}
    with pytest.raises(ConfigError, match="unknown flag 'other_flag'"):
        load_config(write_config(tmp_path, classes=classes, rulesets={"a": body("a"), "legacy": body("legacy")}))
