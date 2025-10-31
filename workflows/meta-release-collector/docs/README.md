# Meta-Release Collector v3 - User Guide

**Status**: Production Ready (Phase 1 Complete)
**Last Updated**: 2025-10-31

## Overview

The Meta-Release Collector is a GitHub Actions workflow that automatically tracks and reports on CAMARA API releases across all repositories. It provides comprehensive release metadata, categorization by meta-releases (Fall24, Spring25, Fall25), and generates interactive HTML viewers.

**Key Features**:
- Incremental updates (analyze only new releases)
- Full re-analysis capability (reprocess all releases)
- Runtime enrichment with portfolio metadata
- Self-contained HTML viewers for GitHub Pages
- Multiple execution modes (dry-run, commit, PR)

## Quick Start

### Running the Workflow

1. Navigate to **Actions** tab in the repository
2. Select **Meta-release Collector v3** workflow
3. Click **Run workflow**
4. Configure options:
   - **Analysis scope**: `incremental` or `full`
   - **Execution mode**: `dry-run`, `commit`, or `pr`
   - **Debug mode**: Enable for detailed logs (optional)

### Recommended Settings

**For weekly updates (default)**:
```
Analysis scope: incremental
Execution mode: commit
Debug mode: false
```

**For testing or workflow changes**:
```
Analysis scope: full
Execution mode: dry-run
Debug mode: true
```

## Configuration Options

### Analysis Scope

#### Incremental Mode (Default)
**When to use**: Regular weekly runs, continuous monitoring

**What it does**:
- Detects only NEW releases since last run
- Compares current GitHub state with `data/releases-master.yaml`
- Fast execution (typically 2-5 minutes)
- Updates master metadata incrementally

**Example**: If you ran the workflow last week and 3 new releases were published, incremental mode will only analyze those 3 releases.

#### Full Mode
**When to use**:
- After workflow script changes
- After configuration updates (api-landscape.yaml, mappings)
- Data validation or correction
- Initial setup

**What it does**:
- Re-analyzes ALL releases across all repositories
- Ignores current state of releases-master.yaml
- Longer execution (typically 5-10 minutes)
- Rebuilds master metadata from scratch

**Example**: After updating api-landscape.yaml with new category assignments, use full mode to regenerate all reports with the new categories.

### Execution Mode

#### Dry-run Mode (Default)
**When to use**: Testing, validation, preview changes

**What it does**:
- Runs complete workflow pipeline
- Generates all reports and viewers
- Creates downloadable artifacts (no commits)
- Safe for experimentation

**Output**: Download `release-reports-*` artifact from workflow run

#### Commit Mode
**When to use**: Production updates, scheduled runs

**What it does**:
- Runs complete workflow pipeline
- Commits changes directly to current branch
- Updates data/, reports/, viewers/
- Immediate deployment (if on main branch)

**Commit message**: `chore: update release metadata [meta-release-collector]`

#### PR Mode
**When to use**: Controlled updates, review required

**What it does**:
- Runs complete workflow pipeline
- Creates pull request with changes
- Allows review before merge
- PR includes summary of changes

**PR title**: `chore: update release metadata`

### Debug Mode

**When to use**: Troubleshooting, detailed analysis

**What it does**:
- Enables verbose logging
- Shows detailed processing steps
- Includes API response details
- Helps diagnose issues

## Understanding the Output

### Generated Files

```
data/
└── releases-master.yaml          # Master metadata (GitHub facts only)

reports/
├── all-releases.json             # Complete dataset (enriched)
├── fall24.json                   # Fall 2024 meta-release
├── spring25.json                 # Spring 2025 meta-release
└── fall25.json                   # Fall 2025 meta-release

viewers/
├── all-releases.html             # Interactive viewer (all releases)
├── fall24.html                   # Fall 2024 viewer
├── spring25.html                 # Spring 2025 viewer
└── fall25.html                   # Fall 2025 viewer
```

### Data Flow

```
GitHub API
    ↓
detect-releases.js → Discovers release tags (rX.Y pattern)
    ↓
analyze-release.js → Extracts API metadata, applies format corrections
    ↓
update-master.js → Updates releases-master.yaml (facts only)
    ↓
generate-reports.js → Enriches with api-landscape.yaml, creates JSON reports
    ↓
generate-viewers.js → Embeds data in HTML templates, creates self-contained viewers
```

### Key Concepts

#### Master Metadata (releases-master.yaml)
- **Pure GitHub facts**: repository, tag, date, API version, commonalities
- **No portfolio metadata**: No categories, URLs, descriptions
- **Source of truth**: Basis for all reports and viewers
- **Format corrections applied**: v-prefix removal, commonalities normalization

#### API Landscape (config/api-landscape.yaml)
- **Portfolio metadata**: Categories, URLs, tooltips, display names
- **Applied at runtime**: During report generation only
- **Not stored in master**: Keeps master clean and factual
- **Easy updates**: Change landscape, run full re-analysis

#### Runtime Enrichment
- Reports combine master facts + landscape enrichments
- Viewers embed enriched data (self-contained, no external dependencies)
- Separation allows independent updates

## Typical Workflows

### Weekly Monitoring
```yaml
Schedule: Mondays 04:35 UTC (when enabled)
Analysis: incremental
Execution: commit
Result: Automatic updates to main branch
```

### After Configuration Changes
```yaml
Trigger: Manual workflow dispatch
Analysis: full
Execution: dry-run (first), then commit
Result: Regenerated reports with new configuration
```

### Testing New Features
```yaml
Branch: Feature branch
Analysis: full
Execution: dry-run
Result: Artifact download for testing
```

## Troubleshooting

### No new releases detected (incremental mode)
**Cause**: No releases published since last run
**Solution**: Normal behavior, no action needed

### Analysis errors for specific repository
**Cause**: Missing or invalid API definition
**Solution**: Check repository release assets for OpenAPI files

### Enrichment failures
**Cause**: API not in api-landscape.yaml
**Solution**: Add API to config/api-landscape.yaml, run full re-analysis

### Workflow timeout
**Cause**: Too many releases to process
**Solution**: Reduce MAX_PARALLEL_JOBS or split into batches

## Configuration Files

### meta-release-mappings.yaml
Maps repository releases to meta-releases:
```yaml
Fall24:
  DeviceLocation:
    - r1.3
  QualityOnDemand:
    - r1.2
```

### api-landscape.yaml
Portfolio metadata for enrichment:
```yaml
- api_name: device-location-verification
  title: Device Location Verification
  category: Location and Tracking
  camaraproject_org_url: https://camaraproject.org/device-location-verification/
  display_name: Device Location Verification
  published: true
  first_release: Fall24
```

### Format Corrections (Hardcoded)
Format corrections are applied automatically during analysis in `scripts/analyze-release.js`:

**Corrections applied**:
- **Version prefix removal**: Strips `v` prefix (e.g., `v0.11.0` → `0.11.0`)
- **Commonalities normalization**: Converts to string format and normalizes `0.4.0` → `0.4`
- **API name normalization**: Converts to lowercase for consistency

These corrections are hardcoded and applied to all releases automatically. No configuration file needed.

## Architecture

See [ADR-0002-runtime-enrichment-architecture.md](ADR/0002-runtime-enrichment-architecture.md) for detailed architecture documentation.

**Key principles**:
- Clean separation: GitHub facts vs portfolio metadata
- Runtime enrichment: Apply metadata during report generation
- Self-contained viewers: Embed all data and libraries
- Static hosting: No backend required (GitHub Pages compatible)

## Maintenance

### Adding New Meta-Releases
1. Update `config/meta-release-mappings.yaml`
2. Update `scripts/generate-reports.js` (add meta-release to list)
3. Update `scripts/generate-viewers.js` (add template generation)
4. Run full re-analysis

### Adding New APIs
1. Add to `config/api-landscape.yaml`
2. Run full re-analysis to enrich existing releases

### Updating Categories or URLs
1. Update `config/api-landscape.yaml`
2. Run full re-analysis to regenerate reports

## Migration Notes

This is version 3 of the meta-release collector workflow:

- **v1**: Original implementation (deprecated)
- **v2**: API-releases workflow (legacy, still in use)
- **v3**: Current implementation with runtime enrichment

v3 will be the primary workflow until Spring 2026 when native `release-metadata.yaml` files become standard in CAMARA repositories.

## Support

For issues or questions:
- Check workflow logs for error messages
- Enable debug mode for detailed diagnostics
- Review [troubleshooting section](#troubleshooting) above
- Consult architecture documentation in [ADR/](ADR/)

---

*This workflow is part of the CAMARA project infrastructure. For more information, see the [project-administration repository](https://github.com/camaraproject/project-administration).*
