"""Load the declared configuration: rulesets, repository classes, repo registry."""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List

import yaml

from .normalise import normalise

# <repo root>/config, from workflows/repository-config/scripts/config.py
DEFAULT_CONFIG_DIR = Path(__file__).resolve().parents[3] / "config"

UNMANAGED = "unmanaged"


class ConfigError(Exception):
    """The declared configuration is inconsistent."""


@dataclass(frozen=True)
class RepoEntry:
    name: str
    cls: str
    single_codeowner: bool = False
    archived: bool = False


@dataclass
class Config:
    rulesets: Dict[str, Dict[str, Any]]
    classes: Dict[str, List[str]]
    main_rulesets: List[str]
    single_codeowner_excludes: List[str]
    retired: List[str]
    registry: Dict[str, RepoEntry] = field(default_factory=dict)

    def desired_rulesets(self, entry: RepoEntry) -> List[str]:
        """Ruleset names the repository's class declares, minus its exclusions."""
        names = self.classes.get(entry.cls, [])
        if entry.single_codeowner:
            names = [n for n in names if n not in self.single_codeowner_excludes]
        return list(names)


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

    raw = _load_yaml(config_dir / "repository-classes.yaml")
    classes = {name: list(spec.get("rulesets", [])) for name, spec in (raw.get("classes") or {}).items()}
    cfg = Config(
        rulesets=rulesets,
        classes=classes,
        main_rulesets=list(raw.get("main_rulesets") or []),
        single_codeowner_excludes=list(raw.get("single_codeowner_excludes") or []),
        retired=list(raw.get("retired") or []),
    )

    for cls, names in classes.items():
        for name in names:
            if name not in rulesets:
                raise ConfigError(f"class {cls}: ruleset '{name}' has no file in rulesets/")
    for name in cfg.retired:
        if name in rulesets or any(name in names for names in classes.values()):
            raise ConfigError(f"'{name}' is both declared and retired")

    registry = (_load_yaml(config_dir / "repositories.yaml")).get("repositories") or {}
    for name, spec in registry.items():
        cls = spec.get("class")
        if cls != UNMANAGED and cls not in classes:
            raise ConfigError(f"repository {name}: unknown class '{cls}'")
        cfg.registry[name] = RepoEntry(
            name=name,
            cls=cls,
            single_codeowner=bool(spec.get("single_codeowner", False)),
            archived=bool(spec.get("archived", False)),
        )
    return cfg
