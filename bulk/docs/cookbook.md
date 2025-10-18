# CAMARA Bulk Orchestrator Cookbook

Practical examples and recipes for common bulk operations across CAMARA repositories.

## Table of Contents

1. [Update GitHub Actions Versions](#recipe-1-update-github-actions-versions)
2. [Add or Update CODEOWNERS](#recipe-2-add-or-update-codeowners)
3. [Detect WIP APIs](#recipe-3-detect-wip-apis)
4. [Update Linting Configuration](#recipe-4-update-linting-configuration)
5. [Standardize Workflow Files](#recipe-5-standardize-workflow-files)
6. [Selector Patterns](#selector-patterns)
7. [Custom PR/Issue Templates](#custom-prissue-templates)

---

## Recipe 1: Update GitHub Actions Versions

Update actions/setup-node from v3 to v4 across all repositories.

**Playbook**: `bulk/playbooks/update-setup-node.yaml`

```yaml
version: 1
selector:
  query: "org:camaraproject archived:false"
  exclude:
    - "camaraproject/Governance"
    - "camaraproject/Template_API_Repository"
strategy:
  mode: "pr"
  plan: false
  concurrency: 6
  failFast: false
  pr:
    branch: "bulk/update-setup-node-v4"
    title: "[bulk] Update actions/setup-node to v4"
    labels: ["bulk-change", "dependencies"]
    reviewers: ["hdamker"]
    bodyTemplatePath: "bulk/templates/pr-default.md"
ops:
  - use: "file.patch@v1"
    with:
      globs:
        - ".github/workflows/*.yml"
        - ".github/workflows/*.yaml"
      replace:
        - from: "actions/setup-node@v3"
          to: "actions/setup-node@v4"
```

**Run**:
```bash
# Plan mode (dry-run)
gh workflow run bulk-run.yaml -f playbook=bulk/playbooks/update-setup-node.yaml -f plan_only=true

# Apply mode
gh workflow run bulk-run.yaml -f playbook=bulk/playbooks/update-setup-node.yaml -f plan_only=false
```

---

## Recipe 2: Add or Update CODEOWNERS

Add a CODEOWNERS file to all API repositories.

**Playbook**: `bulk/playbooks/add-codeowners.yaml`

```yaml
version: 1
selector:
  query: "org:camaraproject archived:false topic:api"
strategy:
  mode: "pr"
  plan: false
  concurrency: 5
  pr:
    branch: "bulk/add-codeowners"
    title: "[bulk] Add CODEOWNERS file"
    labels: ["bulk-change", "governance"]
    bodyTemplate: |
      This PR adds a standard CODEOWNERS file for repository governance.

      All API definitions will require approval from the API Sub-Project maintainers.

      Triggered by: {{actor}}
      Run: {{runUrl}}
ops:
  - use: "file.patch@v1"
    with:
      globs: ["CODEOWNERS"]
      replace:
        - from: "# API Definitions"
          to: |
            # API Definitions
            code/API_definitions/ @camaraproject/api-maintainers
```

---

## Recipe 3: Detect WIP APIs

Collect statistics about repositories with WIP API versions (stats-only, no changes).

**Playbook**: `bulk/playbooks/detect-wip-apis.yaml`

```yaml
version: 1
selector:
  query: "org:camaraproject archived:false topic:api"
strategy:
  mode: "direct"  # No PRs, just collect data
  plan: false
  concurrency: 10
  issue:
    enabled: true
    title: "WIP APIs detected by bulk scan"
    labels: ["wip", "audit"]
    bodyTemplate: |
      Automated scan found WIP API definitions in this repository.

      Please review and update to proper semantic versions.

      Scan run: {{runUrl}}
ops:
  - use: "bulk/ops-local/python/collect_yaml_has_wip.py"
    with:
      paths:
        - "code/API_definitions/*.yaml"
        - "code/API_definitions/**/*.yaml"
```

**Note**: This creates an issue only if WIP APIs are found.

---

## Recipe 4: Update Linting Configuration

Update Spectral linting config reference across all API repositories.

**Playbook**: `bulk/playbooks/update-linting.yaml`

```yaml
version: 1
selector:
  query: "org:camaraproject archived:false"
  has_files: [".spectral.yaml", ".spectral.yml"]
strategy:
  mode: "pr"
  plan: false
  concurrency: 6
  pr:
    branch: "bulk/update-spectral-config"
    title: "[bulk] Update Spectral linting configuration"
    labels: ["bulk-change", "linting"]
    bodyTemplatePath: "bulk/templates/pr-default.md"
ops:
  - use: "file.patch@v1"
    with:
      globs: [".spectral.yaml", ".spectral.yml"]
      replace:
        - from: "extends: [[spectral:oas]]"
          to: "extends: [[spectral:oas, spectral:asyncapi]]"
```

---

## Recipe 5: Standardize Workflow Files

Replace custom megalinter workflows with standardized version.

**Playbook**: `bulk/playbooks/standardize-megalinter.yaml`

```yaml
version: 1
selector:
  query: "org:camaraproject archived:false"
  has_files: [".github/workflows/megalinter.yml"]
strategy:
  mode: "pr"
  plan: false
  concurrency: 5
  failFast: false  # Continue even if some repos fail
  pr:
    branch: "bulk/standardize-megalinter"
    title: "[bulk] Standardize MegaLinter workflow"
    labels: ["bulk-change", "ci"]
    reviewers: []
    bodyTemplate: |
      This PR updates the MegaLinter workflow to use the standardized configuration.

      Changes:
      - Updated to megalinter/megalinter@v7
      - Standardized flavor and configuration
      - Aligned with project best practices

      Run by: {{actor}}
      Workflow: {{runUrl}}
ops:
  - use: "file.patch@v1"
    with:
      globs: [".github/workflows/megalinter.yml"]
      replace:
        - from: "megalinter/megalinter@v6"
          to: "megalinter/megalinter@v7"
        - from: "FLAVOR_SUGGESTIONS: false"
          to: "FLAVOR_SUGGESTIONS: true"
```

---

## Selector Patterns

### Pattern 1: Organization Query

```yaml
selector:
  query: "org:camaraproject archived:false"
```

### Pattern 2: Topic Filtering

```yaml
selector:
  query: "org:camaraproject archived:false topic:api topic:camara"
```

### Pattern 3: Include/Exclude Lists

```yaml
selector:
  query: "org:camaraproject archived:false"
  include:
    - "camaraproject/QualityOnDemand"
    - "camaraproject/DeviceLocation"
  exclude:
    - "camaraproject/Governance"
    - "camaraproject/Template_API_Repository"
```

### Pattern 4: File-Based Filtering

```yaml
selector:
  query: "org:camaraproject archived:false"
  has_files:
    - ".github/workflows/megalinter.yml"
    - "code/API_definitions/*.yaml"
```

Only repositories containing **all** listed files will be selected (after checkout).

### Pattern 5: Sandbox Only

```yaml
selector:
  query: "org:camaraproject archived:false topic:sandbox"
```

### Pattern 6: Working Group Repositories

```yaml
selector:
  query: "org:camaraproject archived:false"
  include:
    - "camaraproject/ReleaseManagement"
    - "camaraproject/Commonalities"
    - "camaraproject/QualityOnDemand"
```

---

## Custom PR/Issue Templates

### Inline Template

```yaml
strategy:
  pr:
    title: "[bulk] Custom change"
    bodyTemplate: |
      This PR applies automated changes to {{repo.fullName}}.

      ## What Changed
      - Updated dependency X to version Y
      - Standardized configuration Z

      ## Testing
      - [ ] CI passes
      - [ ] Manual review completed

      ---
      Automated by {{actor}}
      Run: {{runUrl}}
```

### File-Based Template

Create `bulk/templates/update-dependencies.md`:

```markdown
This PR updates project dependencies in {{repo.fullName}}.

## Changes
{{#changes}}
- Updated {{package}} from {{oldVersion}} to {{newVersion}}
{{/changes}}

## Verification
Please verify that all tests pass before merging.

---
Automated bulk update by {{actor}}
[Workflow Run]({{runUrl}})
```

Reference in playbook:

```yaml
strategy:
  pr:
    title: "[bulk] Update dependencies"
    bodyTemplatePath: "bulk/templates/update-dependencies.md"
```

### Per-Operation Templates

Override PR/Issue body per operation:

```yaml
ops:
  - use: "file.patch@v1"
    with:
      globs: ["package.json"]
      replace: [{from: "1.0.0", to: "2.0.0"}]
    pr:
      bodyTemplate: |
        **Operation**: file.patch@v1
        Updated version in package.json
```

The final PR body will be: Global template + Per-op templates (concatenated with separators).

---

## Advanced Patterns

### Multi-Operation Playbook

```yaml
ops:
  - use: "file.patch@v1"
    with:
      globs: [".github/workflows/*.yml"]
      replace:
        - {from: "ubuntu-20.04", to: "ubuntu-22.04"}

  - use: "file.patch@v1"
    with:
      globs: ["package.json"]
      replace:
        - {from: '"node": "16"', to: '"node": "20"'}

  - use: "bulk/ops-local/python/collect_yaml_has_wip.py"
    with:
      paths: ["**/*.yaml"]
```

All operations run in sequence per repository.

### Fail-Fast for Critical Changes

```yaml
strategy:
  failFast: true  # Stop on first error
  concurrency: 1  # Process one at a time for safety
```

### High Concurrency for Stats Collection

```yaml
strategy:
  mode: "direct"  # No PRs
  concurrency: 15  # Fast stats collection
ops:
  - use: "bulk/ops-local/python/collect_yaml_has_wip.py"
```

---

## Tips and Tricks

### 1. Always Test in Plan Mode

```bash
gh workflow run bulk-run.yaml -f playbook=... -f plan_only=true
```

Review `plan.md` artifact before applying.

### 2. Start with Small Include Lists

```yaml
selector:
  include:
    - "camaraproject/Template_API_Repository"  # Test repo only
```

### 3. Use Descriptive Branch Names

```yaml
pr:
  branch: "bulk/<playbook-id>"  # Auto-replaced with playbook filename
  # or
  branch: "bulk/2025-01-update-actions"  # Explicit
```

### 4. Review Artifacts

- `results.csv` - Machine-readable
- `plan.md` - Human-readable with links
- `results.jsonl` - Streaming logs for debugging

### 5. Combine with Manual Review

```yaml
strategy:
  mode: "pr"
  pr:
    reviewers: ["hdamker", "other-maintainer"]
```

PRs won't auto-merge; maintainers must review and approve.

---

## Troubleshooting

### Issue: No Repositories Selected

**Check**:
- Query syntax in `selector.query`
- Include/exclude lists
- `has_files` patterns (files must exist after checkout)

### Issue: Rate Limit Errors

**Solution**: Reduce concurrency or run during off-peak hours.

```yaml
strategy:
  concurrency: 3  # Lower concurrency
```

### Issue: Permission Denied

**Check**: `CAMARA_BULK_CHANGE_TOKEN` has correct permissions:
- `contents: write`
- `pull-requests: write`
- `issues: write` (if creating issues)

### Issue: Template Not Found

**Check**: `bodyTemplatePath` is relative to workspace root:

```yaml
bodyTemplatePath: "bulk/templates/my-template.md"  # Correct
bodyTemplatePath: "templates/my-template.md"        # Wrong
```

---

## Best Practices

1. **Version your playbooks**: Use git to track changes to playbook files
2. **Document changes**: Clear PR titles and body templates
3. **Test incrementally**: Start with 1-2 repos, then expand
4. **Monitor runs**: Check workflow logs and artifacts
5. **Coordinate timing**: Avoid conflicts with release windows
6. **Review results**: Always check `plan.md` before merging PRs

---

## More Examples

See `bulk/playbooks/` directory for additional examples and templates.
