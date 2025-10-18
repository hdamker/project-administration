# CAMARA Bulk Orchestrator Action

A TypeScript GitHub Action for executing playbook-driven bulk operations across multiple CAMARA repositories.

## Overview

This action provides a flexible, extensible system for performing automated operations across many repositories simultaneously. It supports:

- **Playbook-based configuration**: Define operations in YAML files
- **Plan/Apply workflow**: Preview changes before executing (dry-run by default)
- **Built-in operations**: File patching, and extensible with TypeScript or Python
- **Smart PR/Issue management**: Automatic de-duplication and customizable templates
- **Multiple output formats**: CSV, JSONL, and human-readable Markdown reports
- **Safety features**: Rate limiting, fail-fast option, idempotent operations

## Usage

### Basic Workflow

```yaml
name: Bulk Update
on:
  workflow_dispatch:
    inputs:
      playbook:
        description: Path to playbook YAML
        required: true
        default: bulk/playbooks/sample.yaml
      plan_only:
        description: Dry-run (true/false)
        required: true
        default: "true"

jobs:
  bulk:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }

      - name: Install dependencies
        working-directory: bulk/action
        run: npm ci && npm run build

      - name: Run orchestrator
        uses: ./bulk/action
        with:
          playbook_path: ${{ inputs.playbook }}
          plan_only: ${{ inputs.plan_only }}
          concurrency: 6
        env:
          GITHUB_TOKEN: ${{ secrets.CAMARA_BULK_CHANGE_TOKEN }}

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: bulk-results
          path: |
            results.csv
            results.jsonl
            plan.md
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `playbook_path` | Path to the playbook YAML file | Yes | - |
| `plan_only` | Dry-run mode (true/false) | No | `true` |
| `concurrency` | Maximum concurrent repositories | No | `6` |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub token with appropriate permissions | Yes |
| `GIT_USER_NAME` | Git committer name | No (default: `camara-bot`) |
| `GIT_USER_EMAIL` | Git committer email | No (default: `camara-bot@users.noreply.github.com`) |

## Outputs

The action generates three output files:

### results.csv
Machine-readable CSV with columns: `repo`, `op`, `status`, `pr_url`, `issue_url`, `notes`

### results.jsonl
Streaming JSON logs (one object per line) with timestamps and full details

### plan.md
Human-readable Markdown summary with:
- Playbook configuration
- Repository results with emoji status indicators (✅ ⏭️ ❌)
- Links to created PRs and issues
- Summary statistics

## Playbook Schema

See [playbook.schema.json](src/schemas/playbook.schema.json) for the complete schema.

### Minimal Example

```yaml
version: 1
selector:
  query: "org:camaraproject archived:false"
strategy:
  mode: "pr"
  plan: true
  concurrency: 6
  failFast: false
  pr:
    title: "[bulk] Update dependencies"
    labels: ["bulk-change"]
    bodyTemplatePath: "bulk/templates/pr-default.md"
ops:
  - use: "file.patch@v1"
    with:
      globs: [".github/workflows/*.yml"]
      replace:
        - from: "actions/setup-node@v3"
          to: "actions/setup-node@v4"
```

## Built-in Operations

### file.patch@v1

Performs find-and-replace operations on files matching glob patterns.

**Inputs**:
- `globs` (string[]): Glob patterns to match files
- `replace` (object[]): Array of `{from, to}` replacement pairs

**Example**:
```yaml
- use: "file.patch@v1"
  with:
    globs:
      - ".github/workflows/*.yml"
      - ".github/workflows/*.yaml"
    replace:
      - from: "ubuntu-20.04"
        to: "ubuntu-22.04"
      - from: "node-version: '16'"
        to: "node-version: '20'"
```

## Python Operations

Place Python scripts in `bulk/ops-local/python/` and reference them in playbooks.

**Contract**:
- Read JSON from stdin: `{"repo": {...}, "inputs": {...}, "mode": "plan|apply"}`
- Write JSON to stdout: `{"changes": [...], "rows": [...], "notes": [...]}`

See [ops-local/README.md](../ops-local/README.md) for details.

## Features

### Idempotency

- **PRs**: Searches for existing open PR with same head/base branch, updates instead of creating duplicates
- **Issues**: Searches for existing open issue with same title and labels, updates instead of creating duplicates

### Rate Limiting

Automatic rate limit handling with exponential backoff:
- Primary rate limit: Retry up to 3 times
- Secondary rate limit: Retry once
- Built-in throttling via @octokit/plugin-throttling

### Fail-Fast

Control error handling behavior:
```yaml
strategy:
  failFast: true  # Stop on first error
  # or
  failFast: false # Continue processing (default)
```

### Template Variables

Available in PR/Issue body templates:
- `{{repo.fullName}}` - Repository name (owner/repo)
- `{{actor}}` - GitHub actor who triggered the workflow
- `{{runUrl}}` - URL to the workflow run
- `{{playbook}}` - Name of the playbook file

## Permissions

The action requires these GitHub token permissions:
- `contents: write` - For creating branches and committing changes
- `pull-requests: write` - For creating/updating PRs
- `issues: write` - For creating/updating issues (if enabled)

## Exit Codes

- `0`: Success (all repos processed without errors)
- `1`: Failure (at least one repo failed, or validation error)

When `failFast: true`, exits immediately on first error.
When `failFast: false`, processes all repos then exits with error if any failed.

## Development

See [docs/development.md](../docs/development.md) for local development setup.

## Governance

See [docs/governance.md](../docs/governance.md) for DCO, CLA, and approval processes.

## Examples

See [docs/cookbook.md](../docs/cookbook.md) for example playbooks and recipes.
