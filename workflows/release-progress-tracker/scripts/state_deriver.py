"""Pure state derivation from repository artifacts.

No GitHub API dependency — operates on pre-fetched data only.
"""

import re
from typing import Dict, List, Optional

from .models import ProgressState


def derive_state(
    target_release_type: Optional[str],
    target_release_tag: Optional[str],
    tag_exists: bool,
    snapshot_branches: List[str],
    draft_releases: List[dict],
    release_issue: Optional[Dict] = None,
) -> ProgressState:
    """Derive the progress state from repository artifacts.

    Priority order (highest first):
    1. target_release_type == "none" or missing tag → NOT_PLANNED
    2. Tag exists → PUBLISHED
    3. Snapshot branch + draft release → DRAFT_READY
    4. Snapshot branch only → SNAPSHOT_ACTIVE
    5. Has plan, no artifacts → PLANNED
    """
    if not target_release_type or target_release_type == "none":
        return ProgressState.NOT_PLANNED

    if tag_exists:
        return ProgressState.PUBLISHED

    snapshot = find_matching_snapshot(snapshot_branches, target_release_tag)
    if snapshot:
        if find_matching_draft_release(
            draft_releases, target_release_tag, snapshot
        ):
            return ProgressState.DRAFT_READY
        if issue_indicates_draft_ready(release_issue, target_release_tag):
            return ProgressState.DRAFT_READY
        return ProgressState.SNAPSHOT_ACTIVE

    return ProgressState.PLANNED


def find_matching_snapshot(
    branches: List[str], target_tag: Optional[str]
) -> Optional[str]:
    """Find a snapshot branch matching the target release tag.

    Snapshot branches follow the pattern: release-snapshot/{tag}-{suffix}
    e.g., release-snapshot/r4.2-abc123
    """
    if not target_tag:
        return None

    prefix = f"release-snapshot/{target_tag}-"
    for branch in branches:
        if branch.startswith(prefix):
            return branch
    return None


def find_matching_draft_release(
    draft_releases: List[dict],
    target_tag: Optional[str],
    snapshot_branch: Optional[str] = None,
) -> Optional[dict]:
    """Find a draft release matching the target tag or snapshot branch."""
    if not draft_releases:
        return None

    target_tag = target_tag or ""
    for release in draft_releases:
        tag = release.get("tag_name", "") or ""
        name = release.get("name", "") or ""
        commitish = release.get("target_commitish", "") or ""
        html_url = release.get("html_url", "") or ""

        if snapshot_branch and commitish == snapshot_branch:
            return release

        if target_tag and (
            tag == target_tag
            or name == target_tag
            or target_tag in tag
            or target_tag in name
            or html_url.endswith(f"/releases/tag/{target_tag}")
        ):
            return release

    return None


def issue_indicates_draft_ready(
    release_issue: Optional[Dict],
    target_tag: Optional[str],
) -> bool:
    """Check whether the release issue already reflects draft-ready state."""
    if not release_issue or not issue_matches_target_tag(release_issue, target_tag):
        return False

    labels = set(release_issue.get("labels", []) or [])
    if "release-state:draft-ready" in labels:
        return True

    body = release_issue.get("body", "") or ""
    if "**State:** `draft-ready`" in body:
        return True

    return extract_draft_release_url_from_issue(release_issue) is not None


def issue_matches_target_tag(
    release_issue: Optional[Dict],
    target_tag: Optional[str],
) -> bool:
    """Check whether a release issue belongs to the target tag."""
    if not release_issue:
        return False
    if not target_tag:
        return True

    body = release_issue.get("body", "") or ""
    marker = f"<!-- release-automation:release-tag:{target_tag} -->"
    return marker in body


def extract_draft_release_url_from_issue(
    release_issue: Optional[Dict],
) -> Optional[str]:
    """Extract a draft release URL from the workflow-owned release issue."""
    if not release_issue:
        return None

    body = release_issue.get("body", "") or ""
    match = re.search(
        r"\*\*Draft release:\*\*\s*(?:\[[^\]]+\]\()?("
        r"https://github\.com/[^/\s]+/[^/\s]+/releases/tag/[^\s)]+)",
        body,
    )
    if match:
        return match.group(1)
    return None
