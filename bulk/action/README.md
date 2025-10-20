# CAMARA Bulk Orchestrator Action

A TypeScript GitHub Action for executing playbook-driven bulk operations across multiple CAMARA repositories.

## Overview

This action provides a flexible, extensible system for performing automated operations across many repositories simultaneously. It supports:

- **Playbook-based configuration**: Define operations in YAML files
- **Plan/Apply workflow**: Preview changes before executing (dry-run by default)
- **Built-in operations**: File patching, issue management, extensible with TypeScript or Python
- **Smart PR/Issue management**: Automatic de-duplication and customizable templates
- **Multiple output formats**: JSONL, interactive HTML viewer, and human-readable Markdown reports
- **Lazy repository cloning**: Only clones repositories when operations need worktrees (API-only operations run without cloning)
- **Safety features**: Rate limiting, fail-fast option, idempotent operations, change detection policies

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
            results.jsonl
            results.html
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

### results.jsonl

Machine-readable JSONL (JSON Lines) format with one record per repository. Each record contains:

```json
{
  "timestamp": "2025-10-20T10:30:00.000Z",
  "repo": "owner/repo-name",
  "aggregate": {
    "outcome": "ok_applied",
    "changeStatus": "applied",
    "prUrl": "https://github.com/owner/repo/pull/123",
    "notes": ""
  },
  "operations": [
    {
      "op": "file.patch@v1",
      "plan": {"outcome": "would_apply", "details": {"changedFiles": 2}},
      "apply": {"outcome": "applied", "details": {"changedFiles": 2}}
    }
  ]
}
```

**Aggregate outcomes:**
- `ok_applied` - Changes were applied successfully
- `ok_would_apply` - Changes would be applied (plan mode)
- `ok_noop` - No changes needed
- `error` - Operation failed

**Per-operation outcomes:**
- Plan: `noop`, `would_apply`, `error`
- Apply: `noop`, `applied`, `error`

### results.html

Interactive HTML viewer for browsing results:
- Summary statistics (total, success, errors, no changes)
- Filter by repository name and outcome
- Expandable per-repository cards
- Per-operation details with plan and apply phases
- Raw JSON toggle for debugging

Open in a browser to view results interactively. The file is self-contained with no external dependencies.

### plan.md

Human-readable Markdown summary with:
- Playbook configuration
- Repository results with emoji status indicators (✅ ⏭️ ❌)
- Links to created PRs and issues
- Change status for each repository
- Summary statistics (success/failure/skipped counts)

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

**Type:** File-based (requires repository clone)

Performs find-and-replace operations on files matching glob patterns.

**Inputs**:
- `globs` (string[]): Glob patterns to match files
- `replace` (object[]): Array of `{from, to}` replacement pairs

**Behavior:**
- Clones the repository on demand (lazy worktree pattern)
- Writes changes to disk during plan phase (enables git diff detection)
- Changes are already on disk when apply runs (idempotent)

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

### issue.create@v1

**Type:** API-only (no repository clone needed for inline templates)

Creates or updates GitHub issues by title. Idempotent - searches for existing open issues with the same title and updates them instead of creating duplicates.

**Inputs**:
- `title` (string, required): Issue title (used for uniqueness matching)
- `bodyTemplate` (string, optional): Inline Mustache template for issue body
- `bodyTemplatePath` (string, optional): Path to template file (triggers repository clone)
- `labels` (string[], optional): Issue labels to apply

**Behavior:**
- Searches for existing open issue by exact title match (trimmed)
- If not found: creates new issue
- If found: updates body and labels only if changed
- If found and unchanged: no-op (reports `noop` outcome)
- **API-only mode**: When using `bodyTemplate` (inline), no repository clone needed
- **Hybrid mode**: When using `bodyTemplatePath`, triggers repository clone

**Template variables:**
- `{{repo.fullName}}` - Repository name (e.g., `owner/repo`)
- `{{repo.owner}}` - Repository owner
- `{{repo.name}}` - Repository name
- `{{actor}}` - GitHub user who triggered the workflow
- `{{runUrl}}` - URL to the GitHub Actions workflow run

**Example (API-only):**
```yaml
- use: "issue.create@v1"
  with:
    title: "[Bulk] Automated notification"
    bodyTemplate: |
      This is an automated notification for {{repo.fullName}}.

      **Details:**
      - Actor: {{actor}}
      - Repository: {{repo.fullName}}

      This issue will be updated on subsequent runs if needed.
    labels:
      - "automation"
      - "bulk-change"
```

**Example (with file template):**
```yaml
- use: "issue.create@v1"
  with:
    title: "[Bulk] Automated notification"
    bodyTemplatePath: "bulk/templates/issue-notification.md"
    labels: ["automation"]
```

## Python Operations

Place Python scripts in `bulk/ops-local/python/` and reference them in playbooks.

**Contract**:
- Read JSON from stdin: `{"repo": {...}, "inputs": {...}, "mode": "plan|apply"}`
- Write JSON to stdout: `{"changes": [...], "rows": [...], "notes": [...]}`

See [ops-local/README.md](../ops-local/README.md) for details.

## Features

### Operation Types

The orchestrator supports two types of operations:

**File-based Operations** (e.g., `file.patch@v1`):
- Require repository cloning (lazy worktree pattern)
- Write changes to disk during plan phase for git diff detection
- Changes are already applied when apply phase runs (idempotent)

**API-only Operations** (e.g., `issue.create@v1` with inline template):
- No repository clone needed
- Faster execution (no git operations)
- Perfect for creating/updating issues, labels, or other GitHub metadata

**Hybrid Operations** (e.g., `issue.create@v1` with file template):
- Clone repository only if needed (conditional worktree)
- Inline templates = API-only
- File templates = triggers clone

### Lazy Repository Cloning

Repositories are only cloned when operations need them:
- Operations can throw `NeedsWorktreeError` to request cloning
- Clone happens on-demand during first operation that needs it
- Subsequent operations in the same playbook reuse the worktree
- API-only playbooks never clone (faster, lower API usage)

### Change Detection Policies

Control what constitutes a "meaningful" change for PR creation:

```yaml
strategy:
  diffPolicy: "ignore-eol"  # Default, recommended
```

**Policies:**
- `strict` - Any file modification triggers PR (including whitespace, EOL changes)
- `ignore-eol` - Ignore line ending changes (CRLF ↔ LF), detect real content changes
- `ignore-whitespace` - Ignore all whitespace changes (indentation, trailing spaces)

**Use cases:**
- `ignore-eol`: Default for cross-platform compatibility
- `ignore-whitespace`: When reformatting code (prettier, black, etc.)
- `strict`: When whitespace is semantically important (Makefiles, YAML)

### Idempotency

- **PRs**: Searches for existing open PR with same head/base branch, updates instead of creating duplicates
- **Issues**: Searches for existing open issue with same title, updates instead of creating duplicates
- **Operations**: Re-running the same playbook produces the same result (no duplicate PRs/issues)

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
- `{{repo.fullName}}` - Repository name (e.g., `owner/repo`)
- `{{repo.owner}}` - Repository owner
- `{{repo.name}}` - Repository name
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
