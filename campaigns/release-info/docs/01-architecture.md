# Architecture Overview

This document describes the system design and workflow for bulk campaign changes across CAMARA repositories.

## Design Pattern

The implementation uses a minimal, JS/TS-only pattern for bulk campaign changes:
- One workflow per campaign
- Configuration via committed `env:` values
- Per-repo logic as small Node20 actions (TS → dist committed)
- Plan/apply modes with different behaviors
- Fixed diff/PR/reporting/aggregation logic

## Workflow Flow

### 1. Select Job

Builds a list of target repositories from `data/releases-master.yaml` with optional `INCLUDE` filter.

**Steps:**
1. Checkout project-administration repository
2. Run github-script action to:
   - Load releases-master.yaml
   - Map to repository slugs (org/repo)
   - Filter by INCLUDE if specified
   - Output as JSON array

**Output:** Repository list for matrix strategy

### 2. Run Job (Matrix)

Executes in parallel for each repository from the matrix.

**Steps:**
1. **Checkout repositories:**
   - project-administration (for actions and templates)
   - target repository (for README.md updates)

2. **Read release data:**
   - Parse releases-master.yaml
   - Filter by repository name
   - Exclude sandbox releases
   - Sort by semver to find latest public release
   - Output JSON for templating

3. **Ensure delimited section:**
   - Check for section markers in README.md
   - Insert markers after first `## ` heading if missing
   - Idempotent (no-op if already present)

4. **Render template:**
   - Use Mustache template with release data
   - Support array iteration for multiple APIs
   - Output rendered content to temp file

5. **Replace content:**
   - Replace text between delimiters
   - Write new content in-place
   - Output changed flag

6. **Detect changes:**
   - Run git diff to check for modifications
   - Set changed output (true/false)

7. **Finalize:**
   - campaign-finalize-per-repo composite action handles:
     - PR detection and status determination
     - Commit and push (apply mode)
     - PR creation (apply mode)
     - Outcome recording (JSONL + markdown)
     - Artifact upload
     - Reset (plan mode)

### 3. Aggregate Job (Plan Mode Only)

Merges all per-repo plan artifacts into single files.

**Steps:**
1. Download all plan artifacts from matrix jobs
2. Merge plan.md files into single plan.md
3. Merge plan.jsonl files into single plan.jsonl
4. Upload combined artifacts
5. Add summary to workflow output

## Data Flow

```
releases-master.yaml
    ↓
read-release-data action
    ↓
JSON data model
    ↓
Mustache template (release-info.mustache)
    ↓
Rendered markdown
    ↓
replace-delimited-content action
    ↓
Updated README.md
    ↓
campaign-finalize-per-repo
    ↓
plan.jsonl/results.jsonl (machine-readable)
plan.md/results.md (human-readable)
```

## Invariants

- **Plan mode** never creates PRs or leaves changes in the working tree
- **Apply mode** uses unique branch per run for idempotency
- **Diff/PR/reporting/aggregation** logic is fixed in workflow; campaign-specific logic in templates
- **Actions** are reusable across campaigns without modification

## Actions Architecture

### Content Actions (Node20)

Compiled TypeScript actions with committed dist/:
- `read-release-data` - Parse YAML, filter, sort releases
- `ensure-delimited-section` - Ensure section markers exist
- `render-mustache` - Template rendering
- `replace-delimited-content` - Content replacement

### Finalization Action (Composite)

YAML-defined composite action:
- `campaign-finalize-per-repo` - Generic finalization for all campaigns
  - PR detection and comparison
  - Commit and push
  - PR creation with numbering
  - Outcome recording
  - Artifact management

Separates generic infrastructure from campaign-specific logic.

## Template System

Templates use Mustache syntax:
- Simple variable substitution: `{{variable}}`
- Array iteration: `{{#array}}...{{/array}}`
- Parent context access for nested data

Example:
```mustache
## Release Information

Release: [{{latest_public_release}}]({{github_url}})

APIs in this release:
{{#apis}}
  * **{{file_name}} v{{version}}**
  [[YAML]](https://github.com/camaraproject/{{repo_name}}/blob/{{latest_public_release}}/code/API_definitions/{{file_name}}.yaml)
{{/apis}}
```

## Configuration

All campaign configuration in workflow env section:
- `ORG` - Target organization
- `RELEASES_FILE` - Data source path
- `INCLUDE` - Repository filter
- `BRANCH` - Branch name pattern
- `PR_TITLE` - Base PR title
- `PR_BODY` - PR body text

No hardcoded values in actions or templates.

## Error Handling

Workflow continues on errors and records them:
- `continue-on-error: true` on steps that may fail
- Error capture step detects and describes failures
- Finalize action receives error information
- Errors recorded in JSONL/markdown with status "error"
- All repositories recorded (no silent failures)

## Adapting for New Campaigns

To create a new campaign:
1. Copy workflow file
2. Create campaign directory with templates/
3. Update workflow to reference new template
4. Reuse existing actions (or create custom data action if needed)
5. Keep diff/PR/aggregation logic unchanged

Campaign-specific logic goes in:
- Templates (Mustache)
- Data source actions (if different from releases-master.yaml)
- Workflow env configuration

Generic logic stays in:
- campaign-finalize-per-repo action
- Content manipulation actions
- Workflow structure (select/run/aggregate)
