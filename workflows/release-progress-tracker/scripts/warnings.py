"""Extensible validation warning infrastructure.

Warnings annotate progress entries without changing derived state.
Each check function follows the signature:
    (entry, repo_releases) -> List[ProgressWarning]

Add new checks by writing a _check_* function and appending to CHECKS.
"""

from typing import List

from .models import ProgressEntry, ProgressState, ProgressWarning


def generate_warnings(
    entry: ProgressEntry, repo_releases: List[dict]
) -> List[ProgressWarning]:
    """Generate validation warnings for a progress entry.

    Called after state derivation and releases-master cross-reference.
    Uses only already-collected data — no additional API calls.
    """
    warnings = []
    for check_fn in CHECKS:
        warnings.extend(check_fn(entry, repo_releases))
    return warnings


def _check_published_plan_diverged(
    entry: ProgressEntry, repo_releases: List[dict]
) -> List[ProgressWarning]:
    """W001: State=PUBLISHED but plan has different API versions than published release.

    This catches the case where a tag exists (so state=PUBLISHED) but the
    release-plan.yaml has been updated with new target versions for the next
    cycle. The plan has "moved on" but still points to the old release tag.
    """
    if entry.state != ProgressState.PUBLISHED:
        return []

    if not entry.target_release_tag or not entry.apis:
        return []

    # Find the published release matching the target tag
    published = None
    for rel in repo_releases:
        if rel.get("release_tag") == entry.target_release_tag:
            published = rel
            break

    if not published:
        return []

    # Compare planned API versions with published versions
    published_versions = {}
    for api in published.get("apis", []):
        name = api.get("api_name")
        if name:
            # Strip pre-release extension for comparison
            version = api.get("api_version", "")
            base_version = version.split("-")[0] if version else ""
            published_versions[name] = base_version

    for api in entry.apis:
        published_base = published_versions.get(api.api_name)
        if published_base and api.target_api_version != published_base:
            return [ProgressWarning(
                code="W001",
                message=(
                    f"Plan targets {api.api_name} {api.target_api_version} "
                    f"but {entry.target_release_tag} published {published_base}"
                ),
                severity="warning",
            )]

    return []


def _check_orphaned_snapshot(
    entry: ProgressEntry, repo_releases: List[dict]
) -> List[ProgressWarning]:
    """W002: Snapshot branch exists but target_release_type=none.

    Catches orphaned artifacts from previous release cycles that were
    not cleaned up.
    """
    if entry.state != ProgressState.NOT_PLANNED:
        return []

    if entry.artifacts.snapshot_branch:
        return [ProgressWarning(
            code="W002",
            message=(
                f"Snapshot branch {entry.artifacts.snapshot_branch} exists "
                f"but release type is 'none'"
            ),
            severity="warning",
        )]

    return []


def _check_published_not_in_releases_master(
    entry: ProgressEntry, repo_releases: List[dict]
) -> List[ProgressWarning]:
    """W003: State=PUBLISHED but release tag not found in releases-master.yaml.

    When the tag exists and GitHub Release is published (state=PUBLISHED),
    but the Release Collector hasn't processed it yet, milestone columns
    (M1/M3/M4) will be empty because the release data is missing from
    releases-master.yaml.
    """
    if entry.state != ProgressState.PUBLISHED:
        return []

    if not entry.target_release_tag:
        return []

    for rel in repo_releases:
        if rel.get("release_tag") == entry.target_release_tag:
            return []

    return [ProgressWarning(
        code="W003",
        message=(
            f"Release {entry.target_release_tag} has been published. "
            f"Milestone data will be updated in the next 24 hours."
        ),
        severity="warning",
    )]


def _check_meta_release_mismatch(
    entry: ProgressEntry, repo_releases: List[dict]
) -> List[ProgressWarning]:
    """W004: Release found by tag prefix has different meta_release label.

    When tag prefix matching finds releases with a meta_release label that
    differs from the plan's meta_release, this may indicate a configuration
    issue (e.g., repo assigned to wrong meta-release cycle).

    Skips releases labeled "None (Sandbox)" — these are repos not yet
    assigned to a meta-release cycle, which is expected for new repos.
    """
    if not entry.meta_release or not entry.target_release_tag:
        return []

    # Derive the same tag prefix used by milestone_deriver
    dot_index = entry.target_release_tag.find(".")
    tag_prefix = (
        entry.target_release_tag[:dot_index + 1]
        if dot_index != -1
        else entry.target_release_tag + "."
    )

    for rel in repo_releases:
        rel_tag = rel.get("release_tag") or ""
        rel_meta = rel.get("meta_release")
        if (
            rel_tag.startswith(tag_prefix)
            and rel_meta
            and rel_meta != "None (Sandbox)"
            and rel_meta != entry.meta_release
        ):
            return [ProgressWarning(
                code="W004",
                message=(
                    f"Release {rel_tag} has meta-release '{rel_meta}' "
                    f"in releases-master.yaml but plan specifies "
                    f"'{entry.meta_release}'"
                ),
                severity="warning",
            )]

    return []


def _check_no_caller_workflow(
    entry: ProgressEntry, repo_releases: List[dict]
) -> List[ProgressWarning]:
    """W005: Active release plan but no caller workflow installed."""
    if entry.state != ProgressState.PLANNED:
        return []
    if entry.artifacts.has_caller_workflow is None or entry.artifacts.has_caller_workflow:
        return []
    return [ProgressWarning(
        code="W005",
        message="Active release plan but no caller workflow installed",
        severity="warning",
    )]


# Registry of check functions — add new checks here
CHECKS = [
    _check_published_plan_diverged,           # W001
    _check_orphaned_snapshot,                  # W002
    _check_published_not_in_releases_master,   # W003
    _check_meta_release_mismatch,              # W004
    _check_no_caller_workflow,                 # W005
]
