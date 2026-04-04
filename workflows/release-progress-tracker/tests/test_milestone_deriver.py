"""Tests for M1/M3/M4 milestone derivation."""

import pytest

from scripts.milestone_deriver import (
    derive_cycle_releases,
    derive_last_published,
    build_meta_release_summaries,
    _get_tag_prefix,
)
from scripts.models import (
    ProgressEntry, ProgressState, ApiEntry,
    CycleReleases, MilestoneRelease, CycleReleaseApi,
)


SAMPLE_RELEASES = [
    {
        "repository": "QualityOnDemand",
        "release_tag": "r4.1",
        "release_date": "2026-02-10T14:30:00Z",
        "meta_release": "Sync26",
        "release_type": "pre-release-alpha",
        "apis": [
            {"api_name": "quality-on-demand", "api_version": "1.2.0-alpha.1"},
        ],
    },
    {
        "repository": "QualityOnDemand",
        "release_tag": "r4.2",
        "release_date": "2026-03-15T10:00:00Z",
        "meta_release": "Sync26",
        "release_type": "pre-release-rc",
        "apis": [
            {"api_name": "quality-on-demand", "api_version": "1.2.0-rc.1"},
        ],
    },
    {
        "repository": "DeviceLocation",
        "release_tag": "r5.1",
        "release_date": "2026-02-15T08:00:00Z",
        "meta_release": "Sync26",
        "release_type": "pre-release-alpha",
        "apis": [
            {"api_name": "location-verification", "api_version": "2.0.0-alpha.1"},
        ],
    },
    {
        "repository": "QualityOnDemand",
        "release_tag": "r3.5",
        "release_date": "2025-11-01T12:00:00Z",
        "meta_release": "Fall25",
        "release_type": "public-release",
        "apis": [
            {"api_name": "quality-on-demand", "api_version": "1.1.0"},
        ],
    },
]


class TestDeriveCycleReleases:
    """Test M1/M3/M4 derivation from releases."""

    def test_m1_alpha_detected(self):
        cr = derive_cycle_releases(
            "QualityOnDemand", "r4.1", "Sync26", SAMPLE_RELEASES,
        )
        assert cr.m1 is not None
        assert cr.m1.release_tag == "r4.1"
        assert cr.m1.release_date == "2026-02-10T14:30:00Z"
        assert cr.m1.apis[0].api_version == "1.2.0-alpha.1"

    def test_m3_rc_detected(self):
        cr = derive_cycle_releases(
            "QualityOnDemand", "r4.1", "Sync26", SAMPLE_RELEASES,
        )
        assert cr.m3 is not None
        assert cr.m3.release_tag == "r4.2"

    def test_m4_not_achieved(self):
        cr = derive_cycle_releases(
            "QualityOnDemand", "r4.1", "Sync26", SAMPLE_RELEASES,
        )
        assert cr.m4 is not None
        assert cr.m4.release_tag is None
        assert cr.m4.apis == []  # Unachieved milestone has no API entries

    def test_filters_by_repo_and_tag_prefix(self):
        """Should not include DeviceLocation releases for QualityOnDemand."""
        cr = derive_cycle_releases(
            "QualityOnDemand", "r4.1", "Sync26", SAMPLE_RELEASES,
        )
        # M1 should be QoD's alpha, not DeviceLocation's
        assert cr.m1.release_tag == "r4.1"

    def test_different_tag_prefix_excluded(self):
        """Releases with different tag prefix should not appear in cycle."""
        cr = derive_cycle_releases(
            "QualityOnDemand", "r4.1", "Sync26", SAMPLE_RELEASES,
        )
        # M4 should be unachieved (r3.5 has different prefix r3.)
        assert cr.m4.release_tag is None

    def test_earliest_by_date(self):
        """When multiple alphas exist, should pick earliest by date."""
        releases = SAMPLE_RELEASES + [{
            "repository": "QualityOnDemand",
            "release_tag": "r4.0",
            "release_date": "2026-01-05T08:00:00Z",
            "meta_release": "Sync26",
            "release_type": "pre-release-alpha",
            "apis": [{"api_name": "quality-on-demand", "api_version": "1.2.0-alpha.0"}],
        }]
        cr = derive_cycle_releases(
            "QualityOnDemand", "r4.1", "Sync26", releases,
        )
        assert cr.m1.release_tag == "r4.0"  # Earlier date

    def test_no_releases_returns_empty_milestones(self):
        cr = derive_cycle_releases(
            "NewRepo", "r1.1", "Sync26", SAMPLE_RELEASES,
        )
        assert cr.m1.release_tag is None
        assert cr.m1.apis == []
        assert cr.m3.release_tag is None
        assert cr.m3.apis == []
        assert cr.m4.release_tag is None
        assert cr.m4.apis == []

    def test_no_target_tag_returns_empty(self):
        """When target_release_tag is None, return empty CycleReleases."""
        cr = derive_cycle_releases(
            "QualityOnDemand", None, "Sync26", SAMPLE_RELEASES,
        )
        assert cr.m1 is None
        assert cr.m3 is None

    def test_independent_returns_empty(self):
        """Independent repos (no target_release_tag) get empty CycleReleases."""
        cr = derive_cycle_releases(
            "QualityOnDemand", None, None, SAMPLE_RELEASES,
        )
        assert cr.m1 is None
        assert cr.m3 is None

    def test_tag_prefix_matches_across_minor_versions(self):
        """All rX.Y releases with same major number should be in same cycle."""
        releases = [
            {
                "repository": "TestRepo",
                "release_tag": "r2.1",
                "release_date": "2026-01-10T00:00:00Z",
                "meta_release": "Sync26",
                "release_type": "pre-release-alpha",
                "apis": [{"api_name": "test-api", "api_version": "1.0.0-alpha.1"}],
            },
            {
                "repository": "TestRepo",
                "release_tag": "r2.2",
                "release_date": "2026-02-10T00:00:00Z",
                "meta_release": "Sync26",
                "release_type": "pre-release-rc",
                "apis": [{"api_name": "test-api", "api_version": "1.0.0-rc.1"}],
            },
        ]
        cr = derive_cycle_releases(
            "TestRepo", "r2.3", "Sync26", releases,
        )
        assert cr.m1.release_tag == "r2.1"
        assert cr.m3.release_tag == "r2.2"

    def test_independent_repo_matched_by_tag_prefix(self):
        """Repos with meta_release='Independent' in releases-master
        should still be matched via tag prefix."""
        releases = [
            {
                "repository": "IndependentRepo",
                "release_tag": "r1.1",
                "release_date": "2026-01-15T00:00:00Z",
                "meta_release": "Independent",
                "release_type": "pre-release-alpha",
                "apis": [{"api_name": "independent-api", "api_version": "0.1.0-alpha.1"}],
            },
        ]
        cr = derive_cycle_releases(
            "IndependentRepo", "r1.2", "Sync26", releases,
        )
        assert cr.m1.release_tag == "r1.1"
        assert cr.m1.apis[0].api_version == "0.1.0-alpha.1"

    def test_api_not_in_release_excluded(self):
        """APIs added to plan after a release should not appear in milestone."""
        releases = [{
            "repository": "TestRepo",
            "release_tag": "r1.1",
            "release_date": "2026-01-10T00:00:00Z",
            "release_type": "pre-release-alpha",
            "meta_release": "Sync26",
            "apis": [{"api_name": "original-api", "api_version": "1.0.0-alpha.1"}],
        }]
        cr = derive_cycle_releases(
            "TestRepo", "r1.1", "Sync26", releases,
        )
        assert cr.m1 is not None
        assert len(cr.m1.apis) == 1
        assert cr.m1.apis[0].api_name == "original-api"


class TestGetTagPrefix:
    """Test tag prefix extraction helper."""

    def test_standard_tag(self):
        assert _get_tag_prefix("r4.1") == "r4."

    def test_double_digit_major(self):
        assert _get_tag_prefix("r10.2") == "r10."

    def test_no_dot(self):
        assert _get_tag_prefix("r4") == "r4."


class TestDeriveLastPublished:
    """Test most-recent-release derivation."""

    def test_finds_most_recent_release(self):
        """Should return the latest release by date, regardless of type."""
        result = derive_last_published(
            "QualityOnDemand", "r4.1", SAMPLE_RELEASES,
        )
        assert result is not None
        # r4.2 (2026-03-15) is more recent than r4.1 (2026-02-10)
        assert result.release_tag == "r4.2"
        assert result.release_date == "2026-03-15T10:00:00Z"
        assert result.apis[0].api_version == "1.2.0-rc.1"

    def test_returns_none_when_no_target_tag(self):
        result = derive_last_published(
            "QualityOnDemand", None, SAMPLE_RELEASES,
        )
        assert result is None

    def test_returns_none_when_no_matching_releases(self):
        result = derive_last_published(
            "NonExistentRepo", "r1.1", SAMPLE_RELEASES,
        )
        assert result is None

    def test_only_matches_same_tag_prefix(self):
        """Releases from different cycle (r3.x) should not appear."""
        result = derive_last_published(
            "QualityOnDemand", "r3.1", SAMPLE_RELEASES,
        )
        assert result is not None
        assert result.release_tag == "r3.5"

    def test_multi_api_versions(self):
        """Should extract correct per-API version from multi-API release.

        Only APIs actually present in the release should appear — APIs
        added to the plan later are excluded (PA#197 fix).
        """
        releases = [{
            "repository": "MultiApiRepo",
            "release_tag": "r1.1",
            "release_date": "2026-03-01T00:00:00Z",
            "release_type": "pre-release-alpha",
            "apis": [
                {"api_name": "api-a", "api_version": "1.0.0-alpha.1"},
                {"api_name": "api-b", "api_version": "2.0.0-alpha.1"},
            ],
        }]
        result = derive_last_published(
            "MultiApiRepo", "r1.1", releases,
        )
        assert result is not None
        assert len(result.apis) == 2  # Only APIs in the release
        assert result.apis[0].api_name == "api-a"
        assert result.apis[0].api_version == "1.0.0-alpha.1"
        assert result.apis[1].api_name == "api-b"
        assert result.apis[1].api_version == "2.0.0-alpha.1"

    def test_single_release_in_cycle(self):
        """With only one release, it should be returned as last published."""
        result = derive_last_published(
            "DeviceLocation", "r5.1", SAMPLE_RELEASES,
        )
        assert result is not None
        assert result.release_tag == "r5.1"


class TestBuildMetaReleaseSummaries:
    """Test aggregate summary building."""

    def test_counts_achieved_apis(self):
        entries = [
            ProgressEntry(
                repository="QualityOnDemand",
                github_url="https://github.com/camaraproject/QualityOnDemand",
                meta_release="Sync26",
                apis=[ApiEntry("quality-on-demand", "1.2.0", "rc")],
                cycle_releases=CycleReleases(
                    m1=MilestoneRelease("r4.1", "2026-02-10T14:30:00Z",
                        [CycleReleaseApi("quality-on-demand", "1.2.0-alpha.1")]),
                    m3=MilestoneRelease(None, None, []),
                ),
            ),
        ]
        summaries = build_meta_release_summaries(entries)
        assert "Sync26" in summaries
        assert summaries["Sync26"]["total_apis"] == 1
        assert summaries["Sync26"]["m1_achieved"] == 1
        assert summaries["Sync26"]["m3_achieved"] == 0

    def test_multiple_repos_aggregated(self):
        entries = [
            ProgressEntry(
                repository="RepoA",
                github_url="https://github.com/camaraproject/RepoA",
                meta_release="Sync26",
                apis=[ApiEntry("api-a", "1.0.0", "rc")],
                cycle_releases=CycleReleases(
                    m1=MilestoneRelease("r1.1", "2026-01-01T00:00:00Z",
                        [CycleReleaseApi("api-a", "1.0.0-alpha.1")]),
                ),
            ),
            ProgressEntry(
                repository="RepoB",
                github_url="https://github.com/camaraproject/RepoB",
                meta_release="Sync26",
                apis=[ApiEntry("api-b", "2.0.0", "alpha"),
                      ApiEntry("api-c", "1.0.0", "alpha")],
                cycle_releases=CycleReleases(),
            ),
        ]
        summaries = build_meta_release_summaries(entries)
        assert summaries["Sync26"]["total_apis"] == 3
        assert summaries["Sync26"]["m1_achieved"] == 1

    def test_independent_repos_excluded(self):
        entries = [
            ProgressEntry(
                repository="IndependentRepo",
                github_url="https://github.com/camaraproject/IndependentRepo",
                meta_release=None,
                apis=[ApiEntry("some-api", "1.0.0", "public")],
            ),
        ]
        summaries = build_meta_release_summaries(entries)
        assert len(summaries) == 0
