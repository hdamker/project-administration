"""Render plans as terminal text and as a Markdown job summary."""

from typing import List

from .planner import UNMANAGED_RULESET, RepoPlan


def _plain_action(action) -> str:
    # Fixed two-space gap after the kind keeps `create  name` greppable.
    label = action.ruleset or ""
    parts = [f"{action.kind}  {label}".rstrip()]
    if action.ruleset_id and action.kind in ("update", "remove", UNMANAGED_RULESET):
        parts.append(f"(id {action.ruleset_id})")
    if action.reason:
        parts.append(f"- {action.reason}")
    return " ".join(parts)


def format_repo(plan: RepoPlan) -> str:
    lines = [plan.repo]
    if plan.error:
        lines.append(f"  ERROR  {plan.error}")
    for finding in plan.findings:
        lines.append(f"  DRIFT  {finding}")
    if plan.skipped:
        lines.append(f"  skipped ({plan.skipped})")
    for action in plan.actions:
        lines.append(f"  {_plain_action(action)}")
        if action.diff:
            lines.extend(f"      {d}" for d in action.diff.splitlines())
    for note in plan.notes:
        lines.append(f"  note: {note}")
    if len(lines) == 1:
        lines.append("  ok")
    return "\n".join(lines)


def summary_line(plans: List[RepoPlan]) -> str:
    errors = sum(1 for p in plans if p.error)
    drift = sum(1 for p in plans if p.drift and not p.error)
    clean = len(plans) - errors - drift
    return f"{len(plans)} repositories: {clean} clean, {drift} with drift, {errors} errors"


def format_plan(plans: List[RepoPlan], verbose: bool = False) -> str:
    """All repositories with something to show, then the summary line."""
    blocks = [
        format_repo(p) for p in plans
        if verbose or p.error or p.drift or any(a.kind == UNMANAGED_RULESET for a in p.actions)
    ]
    return "\n\n".join(blocks + [summary_line(plans)])


def format_markdown(plans: List[RepoPlan]) -> str:
    out = ["## Repository configuration plan", "", summary_line(plans), ""]
    for plan in plans:
        if not (plan.error or plan.drift):
            continue
        out.append(f"### {plan.repo}")
        if plan.error:
            out.append(f"- **error:** {plan.error}")
        for finding in plan.findings:
            out.append(f"- **drift:** {finding}")
        for action in plan.actions:
            if action.kind == UNMANAGED_RULESET:
                continue
            out.append(f"- `{_plain_action(action)}`")
            if action.diff:
                out += ["", "  ```diff", *[f"  {d}" for d in action.diff.splitlines()], "  ```", ""]
        out.append("")
    return "\n".join(out)
