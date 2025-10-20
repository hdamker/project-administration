# Playbook Schema Reference

Complete reference for bulk orchestrator playbook YAML files.

## Table of Contents

1. [Overview](#overview)
2. [Root Properties](#root-properties)
3. [Selector](#selector)
4. [Strategy](#strategy)
5. [Operations](#operations)
6. [Complete Examples](#complete-examples)

---

## Overview

Playbooks are YAML files that define bulk operations across repositories.

**File Location:** `bulk/playbooks/*.yaml`

**JSON Schema:** [playbook.schema.json](../action/src/schemas/playbook.schema.json)

**Basic Structure:**
```yaml
version: 1
selector:
  # Which repositories to target
strategy:
  # How to execute operations
ops:
  # What operations to run
```

---

## Root Properties

### version

**Type:** `integer`
**Required:** Yes
**Value:** `1`

The playbook schema version. Currently only version 1 is supported.

**Example:**
```yaml
version: 1
```

---

## Selector

**Type:** `object`
**Required:** Yes

Defines which repositories to target.

### selector.query

**Type:** `string`
**Required:** No
**Default:** `"org:${github.context.repo.owner}"`

GitHub search query for repositories. Uses GitHub's repository search syntax.

**Examples:**
```yaml
# All non-archived repos in organization
selector:
  query: "org:camaraproject archived:false"

# Repos with specific topic
selector:
  query: "org:camaraproject topic:api archived:false"

# Multiple topics (AND logic)
selector:
  query: "org:camaraproject topic:api topic:camara"

# User's fork repositories
selector:
  query: "user:hdamker fork:only"

# Repos with specific language
selector:
  query: "org:camaraproject language:python"
```

**Search Syntax:** See [GitHub Search Syntax](https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories)

### selector.include

**Type:** `array` of `string`
**Required:** No
**Default:** `[]`

Explicit list of repositories to include (overrides query results).

**Behavior:**
- If empty: use all repositories from query
- If not empty: filter query results to only include these repositories

**Example:**
```yaml
selector:
  query: "org:camaraproject"
  include:
    - "camaraproject/QualityOnDemand"
    - "camaraproject/DeviceLocation"
  # Only these 2 repos will be processed, even if query finds more
```

**Use Cases:**
- Testing on specific repositories
- Gradual rollout (start with 2-3 repos)
- Targeting specific subset

### selector.exclude

**Type:** `array` of `string`
**Required:** No
**Default:** `[]`

List of repositories to exclude from query results.

**Example:**
```yaml
selector:
  query: "org:camaraproject archived:false"
  exclude:
    - "camaraproject/Governance"
    - "camaraproject/Template_API_Repository"
  # All repos except these 2
```

**Use Cases:**
- Exclude infrastructure repos
- Skip repositories with special handling
- Exclude repositories under active development

### selector.has_files

**Type:** `array` of `string` (glob patterns)
**Required:** No
**Default:** `[]`

Filter repositories that contain all listed files (after cloning).

**Behavior:**
- Repositories are cloned first
- Then checked for file existence
- If any file is missing: repository is skipped
- Supports glob patterns

**Example:**
```yaml
selector:
  has_files:
    - ".github/workflows/megalinter.yml"  # Exact file
    - "code/API_definitions/*.yaml"       # Glob pattern
```

**Use Cases:**
- Only process repos with specific workflows
- Target repos with certain file structure
- Skip repos that don't have target files

**Note:** This triggers repository clone for filtering, so it's slower than query/include/exclude filters.

### Selector Examples

**Example 1: Organization-wide**
```yaml
selector:
  query: "org:camaraproject archived:false"
```

**Example 2: Specific repos only**
```yaml
selector:
  include:
    - "camaraproject/QualityOnDemand"
    - "camaraproject/DeviceLocation"
```

**Example 3: All except some**
```yaml
selector:
  query: "org:camaraproject archived:false"
  exclude:
    - "camaraproject/Governance"
```

**Example 4: Only repos with Spectral config**
```yaml
selector:
  query: "org:camaraproject archived:false"
  has_files:
    - ".spectral.yaml"
```

---

## Strategy

**Type:** `object`
**Required:** Yes

Defines how operations are executed.

### strategy.mode

**Type:** `string`
**Required:** Yes
**Allowed Values:** `"pr"`, `"direct"`

Execution mode for file changes.

**Values:**

- **`"pr"`** (recommended): Create pull requests for file changes
  - File changes pushed to branch
  - PR created/updated automatically
  - Requires review before merge
  - CI/CD runs on PR

- **`"direct"`**: Commit directly to default branch
  - File changes committed immediately
  - **No PR created**
  - **No review process**
  - **Use with caution**

**Note:** For API-only operations (no file changes), this setting is ignored.

**Example:**
```yaml
strategy:
  mode: "pr"  # Recommended
```

### strategy.plan

**Type:** `boolean`
**Required:** Yes

Whether this is plan mode (dry-run) or apply mode.

**Values:**

- **`true`**: Plan mode (dry-run)
  - No actual changes made (except files written for git diff)
  - Reports what would change
  - Safe to run anytime
  - Review `plan.md` before applying

- **`false`**: Apply mode
  - Actually applies changes
  - Creates commits, pushes branches
  - Creates/updates PRs and issues
  - Requires review of plan first

**Example:**
```yaml
strategy:
  plan: true  # Start with plan mode
```

**Typical Workflow:**
1. Run with `plan: true` → Review `plan.md`
2. If acceptable → Re-run with `plan: false`

### strategy.concurrency

**Type:** `integer`
**Required:** Yes
**Minimum:** 1
**Maximum:** 50
**Default (recommended):** 6

Maximum number of repositories to process concurrently.

**Guidelines:**

| Operation Type | Recommended Concurrency | Rationale |
|---------------|------------------------|-----------|
| File-based | 3-6 | Git operations are I/O heavy |
| API-only | 10-15 | Network requests are lighter |
| Mixed | 5-6 | Conservative for mixed workload |

**Example:**
```yaml
strategy:
  concurrency: 6  # Balanced default
```

**Considerations:**
- Higher concurrency = faster completion
- Too high = rate limiting, resource exhaustion
- API rate limits: 5000 requests/hour (authenticated)

### strategy.failFast

**Type:** `boolean`
**Required:** No
**Default:** `false`

Whether to stop processing immediately on first error.

**Values:**

- **`true`**: Stop on first error
  - Fails fast, provides quick feedback
  - Useful for testing new playbooks
  - Use when partial application is unacceptable

- **`false`** (default): Continue processing
  - Process all repositories
  - Report all errors at end
  - More efficient for bulk operations

**Example:**
```yaml
strategy:
  failFast: true  # Stop on first error
```

### strategy.diffPolicy

**Type:** `string`
**Required:** No
**Default:** `"ignore-eol"`
**Allowed Values:** `"strict"`, `"ignore-eol"`, `"ignore-whitespace"`

Controls what constitutes a "meaningful" change for PR creation.

**Values:**

- **`"strict"`**: Any change triggers PR (including whitespace, line endings)
  - Use for: Makefiles, YAML, Python (where whitespace matters)

- **`"ignore-eol"`** (default): Ignore line ending changes (CRLF ↔ LF)
  - Use for: Cross-platform repositories
  - Most common choice

- **`"ignore-whitespace"`**: Ignore all whitespace changes
  - Use for: Code formatters (prettier, black, gofmt)
  - Reformatting operations

**Example:**
```yaml
strategy:
  diffPolicy: "ignore-eol"  # Default, recommended
```

**Comparison:**

| Policy | Content | Whitespace | Line Endings |
|--------|---------|------------|--------------|
| `strict` | ✅ Detects | ✅ Detects | ✅ Detects |
| `ignore-eol` | ✅ Detects | ✅ Detects | ❌ Ignores |
| `ignore-whitespace` | ✅ Detects | ❌ Ignores | ❌ Ignores |

**See:** [cookbook.md - Change Detection Policies](cookbook.md#change-detection-policies-diffpolicy)

### strategy.pr

**Type:** `object`
**Required:** No (but recommended when `mode: "pr"`)

Pull request configuration (only applies when `mode: "pr"`).

#### strategy.pr.branch

**Type:** `string`
**Required:** No
**Default:** `"bulk/<playbook-id>-<hash>"`

Branch name for pull requests.

**Placeholder:** `<playbook-id>` is replaced with playbook filename.

**Example:**
```yaml
strategy:
  pr:
    branch: "bulk/update-node-20"
    # Or with placeholder:
    branch: "bulk/<playbook-id>"  # becomes "bulk/sample-abc1234"
```

**Note:** A hash suffix is automatically added to make branch unique per playbook version.

#### strategy.pr.title

**Type:** `string`
**Required:** No
**Default:** `"[bulk] Update"`

Pull request title.

**Example:**
```yaml
strategy:
  pr:
    title: "[bulk] Update Node.js to v20"
```

#### strategy.pr.labels

**Type:** `array` of `string`
**Required:** No
**Default:** `[]`

Labels to apply to pull requests.

**Example:**
```yaml
strategy:
  pr:
    labels:
      - "bulk-change"
      - "dependencies"
      - "automation"
```

#### strategy.pr.reviewers

**Type:** `array` of `string`
**Required:** No
**Default:** `[]`

GitHub usernames to request reviews from.

**Example:**
```yaml
strategy:
  pr:
    reviewers:
      - "hdamker"
      - "maintainer-name"
```

**Note:** Reviewers must have write access to the repository.

#### strategy.pr.bodyTemplate

**Type:** `string`
**Required:** No (use `bodyTemplate` or `bodyTemplatePath`, not both)

Inline Mustache template for PR body.

**Template Variables:**
- `{{repo.fullName}}` - Repository name (e.g., `owner/repo`)
- `{{repo.owner}}` - Repository owner
- `{{repo.name}}` - Repository name
- `{{actor}}` - GitHub user who triggered workflow
- `{{runUrl}}` - Workflow run URL
- `{{playbook}}` - Playbook filename

**Example:**
```yaml
strategy:
  pr:
    bodyTemplate: |
      This PR updates Node.js to version 20.

      **Repository**: {{repo.fullName}}
      **Triggered by**: {{actor}}
      **Workflow**: {{runUrl}}

      ## Changes
      - Update .github/workflows/*.yml to use node-version: '20'

      ## Testing
      - [ ] CI passes
```

#### strategy.pr.bodyTemplatePath

**Type:** `string`
**Required:** No (use `bodyTemplate` or `bodyTemplatePath`, not both)

Path to Mustache template file for PR body (relative to workspace root).

**Example:**
```yaml
strategy:
  pr:
    bodyTemplatePath: "bulk/templates/pr-node-update.md"
```

**Template file** (`bulk/templates/pr-node-update.md`):
```markdown
# Node.js Update

This PR updates Node.js to version 20 for {{repo.fullName}}.

Automated by {{actor}}
```

### Strategy Examples

**Example 1: Standard PR mode**
```yaml
strategy:
  mode: "pr"
  plan: true
  concurrency: 6
  failFast: false
  diffPolicy: "ignore-eol"
  pr:
    branch: "bulk/update-actions"
    title: "[bulk] Update GitHub Actions"
    labels: ["bulk-change", "ci"]
    reviewers: ["hdamker"]
    bodyTemplatePath: "bulk/templates/pr-default.md"
```

**Example 2: API-only (high concurrency)**
```yaml
strategy:
  mode: "pr"  # Ignored for API-only ops
  plan: false
  concurrency: 15  # Higher for API-only
  failFast: false
```

**Example 3: Testing mode**
```yaml
strategy:
  mode: "pr"
  plan: true  # Dry-run
  concurrency: 1  # One at a time
  failFast: true  # Stop on first error
```

---

## Operations

**Type:** `array` of `object`
**Required:** Yes
**Minimum Items:** 1

List of operations to execute on each repository.

### Operation Object

Each operation must have:

#### ops[].use

**Type:** `string`
**Required:** Yes

Operation identifier.

**Format:**
- Built-in TypeScript operations: `operation-name@version` (e.g., `file.patch@v1`)
- Python operations: Relative path from workspace root (e.g., `bulk/ops-local/python/script.py`)

**Example:**
```yaml
ops:
  - use: "file.patch@v1"
  - use: "issue.create@v1"
  - use: "bulk/ops-local/python/collect_wip.py"
```

#### ops[].with

**Type:** `object`
**Required:** No (depends on operation)

Operation-specific input parameters.

**Example:**
```yaml
ops:
  - use: "file.patch@v1"
    with:
      globs: ["*.md"]
      replace:
        - from: "old"
          to: "new"
```

**See:** [operations-guide.md](operations-guide.md) for operation-specific parameters.

#### ops[].pr

**Type:** `object`
**Required:** No

Per-operation PR body override. Appended to global PR body.

**Properties:**
- `bodyTemplate` (string): Inline Mustache template
- `bodyTemplatePath` (string): Path to template file

**Example:**
```yaml
ops:
  - use: "file.patch@v1"
    with:
      globs: ["package.json"]
      replace:
        - from: '"version": "1.0.0"'
          to: '"version": "2.0.0"'
    pr:
      bodyTemplate: |
        **Operation**: file.patch@v1
        Updated package.json version to 2.0.0
```

**Result:** Final PR body = global template + per-op templates (separated by `---`)

### Built-in Operations

#### file.patch@v1

Performs find-and-replace on files matching glob patterns.

**Type:** File-based (requires repository clone)

**Inputs:**
- `globs` (string[], required): Glob patterns for files
- `replace` (object[], required): Array of `{from, to}` replacements

**Example:**
```yaml
- use: "file.patch@v1"
  with:
    globs:
      - ".github/workflows/*.yml"
      - "*.md"
    replace:
      - from: "ubuntu-20.04"
        to: "ubuntu-22.04"
      - from: "node-version: '16'"
        to: "node-version: '20'"
```

#### issue.create@v1

Creates or updates GitHub issues by title.

**Type:** API-only (no clone) or Hybrid (clone if using bodyTemplatePath)

**Inputs:**
- `title` (string, required): Issue title (used for uniqueness)
- `bodyTemplate` (string, optional): Inline Mustache template
- `bodyTemplatePath` (string, optional): Path to template file
- `labels` (string[], optional): Issue labels

**Example (API-only):**
```yaml
- use: "issue.create@v1"
  with:
    title: "[Bulk] Action required"
    bodyTemplate: |
      This repository requires attention.

      **Repository**: {{repo.fullName}}
      **Actor**: {{actor}}
    labels:
      - "bulk-automation"
      - "action-required"
```

**Example (Hybrid with file template):**
```yaml
- use: "issue.create@v1"
  with:
    title: "[Bulk] Action required"
    bodyTemplatePath: "bulk/templates/issue-action.md"
    labels: ["bulk-automation"]
```

### Python Operations

Reference Python scripts by path.

**Example:**
```yaml
- use: "bulk/ops-local/python/collect_yaml_has_wip.py"
  with:
    paths:
      - "code/API_definitions/*.yaml"
```

**See:** [ops-local/README.md](../ops-local/README.md) for Python operation contract.

### Operations Examples

**Example 1: Single operation**
```yaml
ops:
  - use: "file.patch@v1"
    with:
      globs: ["README.md"]
      replace:
        - from: "old"
          to: "new"
```

**Example 2: Multiple operations**
```yaml
ops:
  # Operation 1: Update files
  - use: "file.patch@v1"
    with:
      globs: [".github/workflows/*.yml"]
      replace:
        - from: "node-version: '16'"
          to: "node-version: '20'"

  # Operation 2: Create tracking issue
  - use: "issue.create@v1"
    with:
      title: "[Automated] Node 20 migration"
      bodyTemplate: "Migration PR created for {{repo.fullName}}"
      labels: ["automation"]
```

**Example 3: With per-op PR body**
```yaml
ops:
  - use: "file.patch@v1"
    with:
      globs: ["package.json"]
      replace:
        - from: '"node": ">=16"'
          to: '"node": ">=20"'
    pr:
      bodyTemplate: |
        **Updated**: package.json engines requirement
        **Change**: Node.js 16 → 20
```

---

## Complete Examples

### Example 1: Simple File Update

```yaml
version: 1

selector:
  query: "org:camaraproject archived:false"
  exclude:
    - "camaraproject/Governance"

strategy:
  mode: "pr"
  plan: true
  concurrency: 6
  failFast: false
  diffPolicy: "ignore-eol"
  pr:
    branch: "bulk/update-setup-node"
    title: "[bulk] Update actions/setup-node to v4"
    labels: ["bulk-change", "dependencies"]
    bodyTemplatePath: "bulk/templates/pr-default.md"

ops:
  - use: "file.patch@v1"
    with:
      globs:
        - ".github/workflows/*.yml"
      replace:
        - from: "actions/setup-node@v3"
          to: "actions/setup-node@v4"
```

### Example 2: API-Only Issue Creation

```yaml
version: 1

selector:
  query: "org:camaraproject archived:false topic:api"

strategy:
  mode: "pr"  # Ignored for API-only
  plan: false
  concurrency: 15  # High concurrency for API-only
  failFast: false

ops:
  - use: "issue.create@v1"
    with:
      title: "[Bulk] API Repository Audit"
      bodyTemplate: |
        Automated repository audit for {{repo.fullName}}.

        ## Action Items
        - [ ] Review API versioning
        - [ ] Update documentation
        - [ ] Run linting

        Created by {{actor}}
      labels:
        - "audit"
        - "bulk-automation"
```

### Example 3: Mixed Operations

```yaml
version: 1

selector:
  include:
    - "camaraproject/QualityOnDemand"
    - "camaraproject/DeviceLocation"

strategy:
  mode: "pr"
  plan: true
  concurrency: 2
  failFast: true
  pr:
    title: "[bulk] Node 20 migration"
    labels: ["migration", "bulk-change"]
    reviewers: ["hdamker"]
    bodyTemplate: |
      This PR migrates to Node.js 20.

      **Changes:**
      - Updated workflow files
      - Created tracking issue

      Automated by {{actor}}

ops:
  # File operation (triggers clone)
  - use: "file.patch@v1"
    with:
      globs: [".github/workflows/*.yml"]
      replace:
        - from: "node-version: '16'"
          to: "node-version: '20'"

  # Issue operation (reuses worktree)
  - use: "issue.create@v1"
    with:
      title: "[Migration] Node 20"
      bodyTemplate: "PR created for Node 20 migration"
      labels: ["migration"]
```

### Example 4: Testing Playbook

```yaml
version: 1

selector:
  include:
    - "your-username/test-repo"

strategy:
  mode: "pr"
  plan: true  # Dry-run only
  concurrency: 1
  failFast: true  # Stop immediately on error
  diffPolicy: "strict"  # Detect all changes
  pr:
    branch: "test/bulk-orchestrator"
    title: "[TEST] Bulk orchestrator test"
    labels: ["test"]
    bodyTemplate: "This is a test PR"

ops:
  - use: "file.patch@v1"
    with:
      globs: ["README.md"]
      replace:
        - from: "# Test"
          to: "# Test [Modified by bulk orchestrator]"
```

---

## Validation

Validate your playbook against the schema:

```bash
cd bulk/action
npx ajv-cli validate \
  -s src/schemas/playbook.schema.json \
  -d ../../playbooks/your-playbook.yaml
```

---

## See Also

- [cookbook.md](cookbook.md) - Example playbooks and recipes
- [operations-guide.md](operations-guide.md) - Writing custom operations
- [README.md](../action/README.md) - Action overview and usage
- [troubleshooting.md](troubleshooting.md) - Common issues and solutions
