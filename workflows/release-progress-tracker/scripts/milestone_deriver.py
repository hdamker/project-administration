"""M1/M3/M4 milestone derivation from releases-master.yaml data.

Pure functions, no GitHub API dependency.

Milestones within a meta-release cycle:
- M1: First pre-release-alpha (earliest by release_date)
- M3: First pre-release-rc
- M4: First public-release
"""

from typing import Dict, List, Optional

from .models import CycleReleaseApi, CycleReleases, MilestoneRelease


def derive_cycle_releases(
    repo_name: str,
    target_release_tag: Optional[str],
    meta_release: Optional[str],
    all_releases: List[Dict],
) -> CycleReleases:
    """Derive M1/M3/M4 milestone releases for a repo in a release cycle.

    Matches releases by tag prefix (e.g., "r1." matches r1.1, r1.2, etc.)
    rather than meta_release label, so repos with "Independent" (or legacy
    "None (Sandbox)") in releases-master.yaml still get milestone data.

    API lists are built from the actual release data, not from the current
    release plan. This ensures historical milestones only show APIs that
    were part of that release. (Fixes PA#197)

    Args:
        repo_name: Repository name to filter releases for.
        target_release_tag: Target release tag (e.g., "r1.1"). Used to
            derive the cycle prefix (e.g., "r1.") for matching releases.
        meta_release: Meta-release label (e.g., "Sync26"). Kept for W004
            mismatch detection, not used for filtering.
        all_releases: Full releases[] array from releases-master.yaml.

    Returns:
        CycleReleases with M1/M3/M4 populated (or None if not found).
    """
    if not target_release_tag:
        return CycleReleases()

    tag_prefix = _get_tag_prefix(target_release_tag)

    # Filter releases for this repo by tag prefix
    cycle_releases = [
        r for r in all_releases
        if r.get("repository") == repo_name
        and (r.get("release_tag") or "").startswith(tag_prefix)
    ]

    if not cycle_releases:
        return CycleReleases(
            m1=_empty_milestone(),
            m3=_empty_milestone(),
            m4=_empty_milestone(),
        )

    m1 = _find_earliest_by_type(cycle_releases, "pre-release-alpha")
    m3 = _find_earliest_by_type(cycle_releases, "pre-release-rc")
    m4 = _find_earliest_by_type(cycle_releases, "public-release")

    return CycleReleases(m1=m1, m3=m3, m4=m4)


def derive_last_published(
    repo_name: str,
    target_release_tag: Optional[str],
    all_releases: List[Dict],
) -> Optional[MilestoneRelease]:
    """Find the most recently published release in the current cycle.

    Returns the latest release (by release_date) regardless of type,
    or None if no releases exist in the cycle.

    API list is built from the actual release data only. (Fixes PA#197)
    """
    if not target_release_tag:
        return None

    tag_prefix = _get_tag_prefix(target_release_tag)

    cycle_releases = [
        r for r in all_releases
        if r.get("repository") == repo_name
        and (r.get("release_tag") or "").startswith(tag_prefix)
    ]

    if not cycle_releases:
        return None

    # Sort by release_date descending, take most recent
    cycle_releases.sort(key=lambda r: r.get("release_date", ""), reverse=True)
    latest = cycle_releases[0]

    # Build API list from actual release data only
    apis = [
        CycleReleaseApi(
            api_name=a.get("api_name"),
            api_version=a.get("api_version"),
        )
        for a in latest.get("apis", [])
        if a.get("api_name")
    ]

    return MilestoneRelease(
        release_tag=latest.get("release_tag"),
        release_date=latest.get("release_date"),
        apis=apis,
    )


def _get_tag_prefix(target_release_tag: str) -> str:
    """Extract cycle prefix from a release tag.

    Examples: "r1.1" → "r1.", "r10.2" → "r10."
    """
    dot_index = target_release_tag.find(".")
    return (
        target_release_tag[:dot_index + 1]
        if dot_index != -1
        else target_release_tag + "."
    )


def _find_earliest_by_type(
    cycle_releases: List[Dict],
    release_type: str,
) -> MilestoneRelease:
    """Find the earliest release of a given type in the cycle.

    Returns a MilestoneRelease with API versions extracted from the actual
    release data, or an empty milestone if no matching release exists.
    """
    matching = [
        r for r in cycle_releases
        if r.get("release_type") == release_type
    ]

    if not matching:
        return _empty_milestone()

    # Sort by release_date, take earliest
    matching.sort(key=lambda r: r.get("release_date", ""))
    earliest = matching[0]

    # Build API list from actual release data only
    apis = [
        CycleReleaseApi(
            api_name=a.get("api_name"),
            api_version=a.get("api_version"),
        )
        for a in earliest.get("apis", [])
        if a.get("api_name")
    ]

    return MilestoneRelease(
        release_tag=earliest.get("release_tag"),
        release_date=earliest.get("release_date"),
        apis=apis,
    )


def _empty_milestone() -> MilestoneRelease:
    """Create an unachieved milestone with null values."""
    return MilestoneRelease(
        release_tag=None,
        release_date=None,
        apis=[],
    )


def build_meta_release_summaries(
    progress_entries: List,
) -> Dict[str, Dict]:
    """Build per-meta-release summary counts.

    Returns a dict of meta_release_name -> {total_apis, m1_achieved, m3_achieved, m4_achieved}.
    """
    summaries: Dict[str, Dict] = {}

    for entry in progress_entries:
        mr = entry.meta_release
        if not mr:
            continue

        if mr not in summaries:
            summaries[mr] = {
                "total_apis": 0,
                "m1_achieved": 0,
                "m3_achieved": 0,
                "m4_achieved": 0,
            }

        s = summaries[mr]
        s["total_apis"] += len(entry.apis)

        cr = entry.cycle_releases
        n = len(entry.apis)
        if cr.m1 and cr.m1.release_tag:
            s["m1_achieved"] += n
        if cr.m3 and cr.m3.release_tag:
            s["m3_achieved"] += n
        if cr.m4 and cr.m4.release_tag:
            s["m4_achieved"] += n

    return summaries
