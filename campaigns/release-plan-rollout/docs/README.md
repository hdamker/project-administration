# Release Plan Rollout Campaign - Documentation

## Overview

This campaign automates the rollout of `release-plan.yaml` to all CAMARA API repositories as part of Phase 2 of the CAMARA release workflow implementation.

## Architecture

### Three-Job Structure

```
select → run (matrix) → aggregate
```

1. **select**: Build repository list from releases-master.yaml
   - Apply INCLUDE filter if specified
   - Check for existing release-plan.yaml (skip if exists)

2. **run**: Matrix job per repository
   - Generate release-plan.yaml from last release data
   - Render PR body template
   - Use campaign-finalize-per-repo for commit/PR creation

3. **aggregate**: Merge plan artifacts (plan mode only)

### Actions

| Action | Location | Purpose |
|--------|----------|---------|
| `generate-release-plan` | `campaigns/release-plan-rollout/actions/` | Generate YAML from releases-master |
| `render-mustache` | `actions/` | Render PR body template |
| `campaign-finalize-per-repo` | `actions/` | Generic campaign finalization |

## Data Mapping

### From releases-master.yaml

```yaml
releases:
  - repository: "QualityOnDemand"
    release_tag: "r1.2"
    release_type: "public-release"
    meta_release: "Fall25"
    apis:
      - api_name: "quality-on-demand"
        version: "1.0.0"
```

### To release-plan.yaml (Status Quo)

```yaml
repository:
  release_track: "meta-release"
  meta_release: "Fall25"
  target_release_tag: "r1.2"
  target_release_type: "public-release"
apis:
  - api_name: "quality-on-demand"
    target_api_version: "1.0.0"
    target_api_status: "public"
```

### Status Derivation

| Version Pattern | target_api_status |
|-----------------|-------------------|
| `X.Y.Z-alpha.N` | `alpha` |
| `X.Y.Z-rc.N` | `rc` |
| `X.Y.Z` | `public` |

## Testing

### Plan Mode Testing

```bash
# Run against specific repos
dry_run: true
include: "QualityOnDemand, DeviceLocation"
```

Review generated artifacts in workflow summary.

### Apply Mode Testing

```bash
# Create PRs for friendly repos first
dry_run: false
include: "QualityOnDemand"
```

PRs can be reviewed and closed without harm.

## Dependencies

- **PR#98**: Extended Release Collector with `release_type` field
- **Workstream 5**: Validation workflow (stub integrated, full validation pending)

## Related Issues

- [Tracking Issue #99](https://github.com/camaraproject/project-administration/issues/99)
- [Release Workflow #342](https://github.com/camaraproject/ReleaseManagement/issues/342)
- [Tooling #46](https://github.com/camaraproject/tooling/issues/46)
