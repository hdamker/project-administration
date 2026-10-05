"""Command line: plan, apply, export.

Exit codes of ``plan``: 0 no drift, 2 drift, 1 error.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Callable, List, Optional

from .codeowners import is_single_codeowner
from .config import DEFAULT_CONFIG_DIR, ConfigError, load_config
from .github_api import GitHubAPI, GitHubError
from .normalise import normalise
from .planner import UNMANAGED_RULESET, apply_plan, plan_all
from .report import format_markdown, format_plan, format_repo

DEFAULT_ORG = "camaraproject"


def _repo_list(value: str) -> List[str]:
    return [r.strip() for r in value.split(",") if r.strip()]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="repository-config", description=__doc__)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--org", default=DEFAULT_ORG)
    common.add_argument("--config-dir", type=Path, default=DEFAULT_CONFIG_DIR)
    sub = parser.add_subparsers(dest="command", required=True)

    plan = sub.add_parser("plan", parents=[common], help="report drift between the declared configuration and GitHub")
    plan.add_argument("--repos", type=_repo_list, help="comma-separated names (default: all registry entries)")
    plan.add_argument("--markdown", type=Path, help="append a Markdown summary to this file")
    plan.add_argument("--verbose", action="store_true", help="also list repositories without drift")

    apply = sub.add_parser("apply", parents=[common], help="bring the named repositories to the declared state")
    apply.add_argument("--repos", type=_repo_list, required=True, help="comma-separated names (required)")
    apply.add_argument("--yes", action="store_true", help="do not ask for confirmation")

    check = sub.add_parser("check-entry", parents=[common],
                           help="check the registry entry of a repository about to be created")
    check.add_argument("--repo", required=True)
    check.add_argument("--ruleset-class", required=True, help="expected ruleset_class")
    check.add_argument("--codeowners", required=True, help="space-separated initial codeowners")

    export = sub.add_parser("export", parents=[common], help="write a live ruleset as a declared file")
    export.add_argument("--repo", required=True)
    export.add_argument("--ruleset", required=True, help="ruleset name")
    export.add_argument("--output-dir", type=Path, help="default: <config-dir>/rulesets")
    return parser


def _plan(args, api, cfg, out) -> int:
    plans = plan_all(api, cfg, args.org, only=args.repos)
    out(format_plan(plans, verbose=args.verbose))
    calls = getattr(api, "api_calls", None)
    if calls is not None:
        out(f"API calls: {calls}")
    if args.markdown:
        with args.markdown.open("a") as handle:
            handle.write(format_markdown(plans) + "\n")
    if any(p.error for p in plans):
        return 1
    return 2 if any(p.drift for p in plans) else 0


def _apply(args, api, cfg, out, ask) -> int:
    code = 0
    for repo in args.repos:
        plan = plan_all(api, cfg, args.org, only=[repo])[0]
        if plan.error:
            out(format_repo(plan))
            code = 1
            continue
        if not any(a.kind != UNMANAGED_RULESET for a in plan.actions):
            if plan.findings:
                out(format_repo(plan))
            out(f"{repo}: nothing to do")
            continue
        out(format_repo(plan))
        if not args.yes and ask(f"Apply to {repo}? [y/N] ").strip().lower() != "y":
            out(f"{repo}: declined")
            code = 1
            continue
        try:
            apply_plan(api, cfg, args.org, plan, log=lambda message, repo=repo: out(f"{repo}: {message}"))
        except GitHubError as exc:
            out(f"{repo}: ERROR {exc}")
            code = 1
    return code


def _check_entry(args, cfg, out) -> int:
    entry = cfg.registry.get(args.repo)
    if entry is None:
        out(f"{args.repo}: no entry in repositories.yaml; add it by PR before creating the repository")
        return 1
    errors = []
    if entry.ruleset_class != args.ruleset_class:
        errors.append(f"ruleset_class is '{entry.ruleset_class}', expected '{args.ruleset_class}'")
    single = is_single_codeowner(f"* {args.codeowners}\n")
    if single is not None and single != entry.single_codeowner:
        errors.append(
            f"single_codeowner is {str(entry.single_codeowner).lower()}, "
            f"initial codeowners give {str(single).lower()}"
        )
    for error in errors:
        out(f"{args.repo}: {error}")
    if not errors:
        out(f"{args.repo}: registry entry ok (ruleset_class {entry.ruleset_class})")
    return 1 if errors else 0


def _export(args, api, cfg, out) -> int:
    matches = [r for r in api.list_rulesets(args.org, args.repo) if r["name"] == args.ruleset]
    if len(matches) != 1:
        out(f"{args.repo}: expected one ruleset named {args.ruleset}, found {len(matches)}")
        return 1
    body = normalise(api.get_ruleset(args.org, args.repo, matches[0]["id"]))
    target = (args.output_dir or args.config_dir / "rulesets") / f"{args.ruleset}.json"
    target.write_text(json.dumps(body, indent=2) + "\n")
    out(f"wrote {target}")
    return 0


def main(argv: Optional[List[str]] = None, api=None, out: Callable[[str], None] = print,
         ask: Optional[Callable[[str], str]] = input) -> int:
    args = build_parser().parse_args(argv)
    try:
        cfg = load_config(args.config_dir) if args.command != "export" else None
        if args.command == "check-entry":
            return _check_entry(args, cfg, out)
        api = api or GitHubAPI()
        if args.command == "plan":
            return _plan(args, api, cfg, out)
        if args.command == "apply":
            return _apply(args, api, cfg, out, ask)
        return _export(args, api, cfg, out)
    except (ConfigError, GitHubError) as exc:
        out(f"ERROR {exc}")
        return 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
