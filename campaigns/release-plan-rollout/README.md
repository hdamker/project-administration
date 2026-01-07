# Campaign: Release Plan Rollout

This campaign adds `release-plan.yaml` to all CAMARA API repositories.

## Purpose

The `release-plan.yaml` file enables:
- Declaration of release targets (tag, type, API versions)
- CI validation of release planning consistency
- Automated release progress tracking

## Usage

### Plan Mode (Dry Run)

Run in plan mode to preview changes without creating PRs:

```yaml
# Via GitHub Actions UI
dry_run: true
include: ""  # All repos, or "QualityOnDemand, DeviceLocation" for specific repos
```

### Apply Mode

Run in apply mode to create PRs:

```yaml
dry_run: false
include: ""  # All repos
```

## Workflow Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `dry_run` | boolean | `true` | Plan mode (no PRs created) |
| `include` | string | `""` | Comma-separated repository names to process |

## Logic

1. **Select**: Query releases-master.yaml for unique repositories
2. **Filter**: Apply INCLUDE filter, skip repos with existing release-plan.yaml
3. **Generate**: Create release-plan.yaml with status quo values from last release
4. **PR**: Create PR with instructions for code owners

## Generated Content

The campaign generates `release-plan.yaml` reflecting the **last release state** (status quo):

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

Code owners should update `target_*` fields to reflect their intended next release.

## Related

- [Release Plan Schema](https://github.com/camaraproject/ReleaseManagement/blob/main/artifacts/metadata-schemas/schemas/release-plan-schema.yaml)
- [Release Workflow Documentation](https://github.com/camaraproject/ReleaseManagement/issues/342)
- [Tracking Issue](https://github.com/camaraproject/project-administration/issues/99)
