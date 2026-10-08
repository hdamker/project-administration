"""Plan and apply the declared rulesets and classic branch protection.

``plan_*`` only reads. ``apply_plan`` runs a plan: create/update first, then
remove, classic branch protection rules last and only once all declared
rulesets of the repository are confirmed active.
"""

import difflib
import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .codeowners import is_single_codeowner
from .config import UNMANAGED, Config, RepoEntry
from .github_api import GitHubError, RepoNotFound
from .normalise import normalise

CREATE = "create"
UPDATE = "update"
REMOVE = "remove"
UNMANAGED_RULESET = "unmanaged"
REMOVE_CLASSIC = "remove-classic-protection"
# Listed in the plan, never changed, not drift
UNMANAGED_KINDS = (UNMANAGED_RULESET,)


@dataclass
class Action:
    kind: str
    ruleset: Optional[str] = None
    ruleset_id: Optional[int] = None
    diff: str = ""
    reason: str = ""
    pattern: str = ""
    classic_rule_id: str = ""


@dataclass
class RepoPlan:
    repo: str
    entry: Optional[RepoEntry] = None
    default_branch: str = ""
    actions: List[Action] = field(default_factory=list)
    findings: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    skipped: str = ""
    error: str = ""

    @property
    def drift(self) -> bool:
        return bool(self.findings) or any(a.kind not in UNMANAGED_KINDS for a in self.actions)


def ruleset_diff(declared: Dict[str, Any], live: Dict[str, Any]) -> str:
    """Unified diff of the two normalised rulesets; empty when equal."""
    if declared == live:
        return ""
    def dump(r):
        return json.dumps(r, indent=2, sort_keys=True).splitlines()
    return "\n".join(difflib.unified_diff(dump(live), dump(declared), "live", "declared", lineterm="", n=2))


def plan_repo(api, cfg: Config, org: str, entry: RepoEntry, gh_repo: Dict[str, Any]) -> RepoPlan:
    name = entry.name
    plan = RepoPlan(repo=name, entry=entry, default_branch=gh_repo["default_branch"])

    if bool(gh_repo.get("archived")) != entry.archived:
        plan.findings.append(
            f"archived flag mismatch (registry {str(entry.archived).lower()}, "
            f"GitHub {str(bool(gh_repo.get('archived'))).lower()})"
        )
    if gh_repo.get("archived"):
        plan.skipped = "archived"
        return plan
    if entry.ruleset_class == UNMANAGED:
        plan.skipped = UNMANAGED
        return plan

    _check_single_codeowner(api, org, entry, plan)

    desired = cfg.desired_rulesets(entry)
    removable = (cfg.declared_names() - set(desired)) | set(cfg.retired)

    live_by_name: Dict[str, List[Dict[str, Any]]] = {}
    for summary in api.list_rulesets(org, name):
        live_by_name.setdefault(summary["name"], []).append(summary)

    writes: List[Action] = []
    removes: List[Action] = []
    unmanaged: List[Action] = []

    for ruleset in desired:
        found = live_by_name.get(ruleset, [])
        if len(found) > 1:
            plan.findings.append(f"duplicate ruleset name '{ruleset}'")
        elif not found:
            writes.append(Action(CREATE, ruleset))
        else:
            live = normalise(api.get_ruleset(org, name, found[0]["id"]))
            diff = ruleset_diff(cfg.rulesets[ruleset], live)
            if diff:
                writes.append(Action(UPDATE, ruleset, found[0]["id"], diff))

    for ruleset, found in sorted(live_by_name.items()):
        if ruleset in desired:
            continue
        for summary in found:
            if ruleset in removable:
                reason = "retired" if ruleset in cfg.retired else "not declared for this repository"
                removes.append(Action(REMOVE, ruleset, summary["id"], reason=reason))
            else:
                unmanaged.append(Action(UNMANAGED_RULESET, ruleset, summary["id"]))

    plan.actions = writes + removes + unmanaged
    # Rulesets replace classic protection entirely: the default branch by the
    # `main` rulesets, legacy release branches by the legacy_releases flag.
    for rule in api.list_classic_rules(org, name):
        plan.actions.append(Action(REMOVE_CLASSIC, pattern=rule["pattern"], classic_rule_id=rule["id"],
                                   reason=f"classic rule '{rule['pattern']}'"))
    return plan


def _check_single_codeowner(api, org: str, entry: RepoEntry, plan: RepoPlan) -> None:
    text = api.get_codeowners(org, entry.name, plan.default_branch)
    actual = is_single_codeowner(text) if text is not None else None
    if actual is None:
        plan.notes.append("CODEOWNERS has no default owner: single_codeowner not checked")
    elif actual != entry.single_codeowner:
        plan.findings.append(
            f"single_codeowner mismatch (registry {str(entry.single_codeowner).lower()}, "
            f"CODEOWNERS {str(actual).lower()})"
        )


def plan_all(api, cfg: Config, org: str, only: Optional[List[str]] = None) -> List[RepoPlan]:
    if only:
        # Look up named repositories directly: a just-created one may lag in the listing.
        names = list(only)
        gh_repos = {}
        for name in names:
            try:
                gh_repos[name] = api.get_repo(org, name)
            except RepoNotFound:
                pass
    else:
        gh_repos = {r["name"]: r for r in api.list_org_repos(org)}
        names = sorted(set(cfg.registry) | set(gh_repos))
    plans: List[RepoPlan] = []
    for name in names:
        entry, gh_repo = cfg.registry.get(name), gh_repos.get(name)
        if entry is None and gh_repo is None:
            plans.append(RepoPlan(repo=name, error="not in the registry and not found on GitHub"))
        elif entry is None:
            plans.append(RepoPlan(repo=name, findings=["unregistered"]))
        elif gh_repo is None:
            plans.append(RepoPlan(repo=name, entry=entry, findings=["registered but not found on GitHub"]))
        else:
            try:
                plans.append(plan_repo(api, cfg, org, entry, gh_repo))
            except GitHubError as exc:
                plans.append(RepoPlan(repo=name, entry=entry, error=str(exc)))
    return plans


def apply_plan(api, cfg: Config, org: str, plan: RepoPlan, log=lambda message: None) -> None:
    """Execute the actions of a fresh plan for one repository."""
    name = plan.repo
    for action in plan.actions:
        if action.kind in (CREATE, UPDATE):
            payload = cfg.rulesets[action.ruleset]
            if action.kind == CREATE:
                api.create_ruleset(org, name, payload)
            else:
                api.update_ruleset(org, name, action.ruleset_id, payload)
            log(f"{action.kind} {action.ruleset}")
    for action in plan.actions:
        if action.kind == REMOVE:
            api.delete_ruleset(org, name, action.ruleset_id)
            log(f"remove {action.ruleset}")
    classic = [a for a in plan.actions if a.kind == REMOVE_CLASSIC]
    if classic:
        _require_declared_rulesets_active(api, cfg, org, plan)
        for action in classic:
            api.delete_classic_rule(action.classic_rule_id)
            log(f"remove classic rule '{action.pattern}'")
        remaining = api.list_classic_rules(org, name)
        if remaining:
            raise GitHubError(
                f"{name}: classic protection still present: {', '.join(r['pattern'] for r in remaining)}"
            )


def _require_declared_rulesets_active(api, cfg: Config, org: str, plan: RepoPlan) -> None:
    required = cfg.desired_rulesets(plan.entry)
    live = {r["name"]: r["enforcement"] for r in api.list_rulesets(org, plan.repo)}
    missing = [n for n in required if live.get(n) != "active"]
    if missing:
        raise GitHubError(
            f"{plan.repo}: not removing classic protection, ruleset(s) not active: {', '.join(missing)}"
        )
