"""Load the declared configuration: rulesets, ruleset classes, repo registry."""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List

import yaml

from .normalise import normalise

# <repo root>/config, from workflows/repository-config/scripts/config.py
DEFAULT_CONFIG_DIR = Path(__file__).resolve().parents[3] / "config"

UNMANAGED = "unmanaged"

# Registry flags that add rulesets (see flag_rulesets in ruleset-classes.yaml)
FLAGS = ("legacy_releases",)


class ConfigError(Exception):
    """The declared configuration is inconsistent."""


@dataclass(frozen=True)
class RepoEntry:
    name: str
    ruleset_class: str
    single_codeowner: bool = False
    archived: bool = False
    legacy_releases: bool = False


@dataclass
class Config:
    rulesets: Dict[str, Dict[str, Any]]
    ruleset_classes: Dict[str, List[str]]
    flag_rulesets: Dict[str, List[str]]
    single_codeowner_excludes: List[str]
    retired: List[str]
    registry: Dict[str, RepoEntry] = field(default_factory=dict)

    def desired_rulesets(self, entry: RepoEntry) -> List[str]:
        """Ruleset names of the repository's ruleset class minus its exclusions, plus those of its flags."""
        names = self.ruleset_classes.get(entry.ruleset_class, [])
        if entry.single_codeowner:
            names = [n for n in names if n not in self.single_codeowner_excludes]
        for flag, flagged in self.flag_rulesets.items():
            if getattr(entry, flag):
                names = names + [n for n in flagged if n not in names]
        return list(names)

    def declared_names(self) -> set:
        names = {n for group in self.ruleset_classes.values() for n in group}
        return names | {n for group in self.flag_rulesets.values() for n in group}


def _load_yaml(path: Path) -> Dict[str, Any]:
    try:
        return yaml.safe_load(path.read_text()) or {}
    except (OSError, yaml.YAMLError) as exc:
        raise ConfigError(f"{path}: {exc}") from exc


def load_config(config_dir: Path = DEFAULT_CONFIG_DIR) -> Config:
    config_dir = Path(config_dir)

    rulesets: Dict[str, Dict[str, Any]] = {}
    for path in sorted((config_dir / "rulesets").glob("*.json")):
        body = json.loads(path.read_text())
        if body.get("name") != path.stem:
            raise ConfigError(f"{path.name}: name '{body.get('name')}' differs from file '{path.stem}'")
        if "bypass_actors" not in body:
            raise ConfigError(f"{path.name}: bypass_actors missing (export with write access)")
        rulesets[path.stem] = normalise(body)

    raw = _load_yaml(config_dir / "ruleset-classes.yaml")
    classes = {name: list(spec.get("rulesets", [])) for name, spec in (raw.get("ruleset_classes") or {}).items()}
    cfg = Config(
        rulesets=rulesets,
        ruleset_classes=classes,
        flag_rulesets={flag: list(names) for flag, names in (raw.get("flag_rulesets") or {}).items()},
        single_codeowner_excludes=list(raw.get("single_codeowner_excludes") or []),
        retired=list(raw.get("retired") or []),
    )

    for cls, names in classes.items():
        for name in names:
            if name not in rulesets:
                raise ConfigError(f"ruleset_class {cls}: ruleset '{name}' has no file in rulesets/")
    for flag, names in cfg.flag_rulesets.items():
        if flag not in FLAGS:
            raise ConfigError(f"unknown flag '{flag}' in flag_rulesets")
        for name in names:
            if name not in rulesets:
                raise ConfigError(f"flag {flag}: ruleset '{name}' has no file in rulesets/")
    for name in cfg.retired:
        if name in rulesets or name in cfg.declared_names():
            raise ConfigError(f"'{name}' is both declared and retired")

    registry = (_load_yaml(config_dir / "repositories.yaml")).get("repositories") or {}
    for name, spec in registry.items():
        cls = spec.get("ruleset_class")
        if cls != UNMANAGED and cls not in classes:
            raise ConfigError(f"repository {name}: unknown ruleset_class '{cls}'")
        cfg.registry[name] = RepoEntry(
            name=name,
            ruleset_class=cls,
            single_codeowner=bool(spec.get("single_codeowner", False)),
            archived=bool(spec.get("archived", False)),
            legacy_releases=bool(spec.get("legacy_releases", False)),
        )
    return cfg
