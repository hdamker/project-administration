# Actions Reference

This campaign uses reusable actions for content manipulation, templating, and finalization. Some actions are generic (reusable across campaigns), while others are campaign-specific.

## Content Actions (Node20)

All Node20 actions are TypeScript compiled to `dist/index.js` and committed.

### read-release-data

**Scope:** Campaign-specific (release-info only)

Parses `data/releases-master.yaml` to extract release information for a specific repository.

**Inputs:**
- `releases_file` - Path to releases-master.yaml
- `repo_slug` - Repository slug (e.g., "camaraproject/DeviceLocation")

**Outputs:**
- `json` - Stringified JSON data for Mustache templating (includes all APIs)
- `summary` - Minimal JSON for reporting (`latest_public_release`, `api_count`)

**Logic:**
1. Load YAML file
2. Filter releases by repository name
3. Exclude sandbox releases (`meta_release` contains "Sandbox")
4. Sort by semver (extract from `release_tag` like "r3.2")
5. Select latest (highest version)
6. Output all APIs from that release

**Reusability:** Not reusable - tied to releases-master.yaml structure. Other campaigns would create similar data-reading actions for their sources.

---

### ensure-delimited-section

**Scope:** Generic (reusable across campaigns)

Ensures a delimited section exists in a file, inserting markers if missing.

**Inputs:**
- `file` - Target file path (e.g., "README.md")
- `start` - Start delimiter (e.g., "<!-- CAMARA:RELEASE-INFO:START -->")
- `end` - End delimiter (e.g., "<!-- CAMARA:RELEASE-INFO:END -->")
- `placeholder` - Placeholder text between markers

**Behavior:**
- Checks if both delimiters exist in file
- If missing: inserts section after first `## ` heading
- If present: no changes (idempotent)
- Fails if file doesn't exist or no `## ` heading found

**Reusability:** Fully reusable. Any campaign managing delimited sections can use this action with different delimiter markers.

---

### render-mustache

**Scope:** Generic (reusable across campaigns)

Renders a Mustache template with provided JSON data.

**Inputs:**
- `template` - Path to Mustache template file
- `data_json` - JSON string or data object
- `out_file` - Output file path

**Features:**
- Simple variable substitution: `{{key}}`
- Array iteration: `{{#array}}...{{/array}}`
- Parent context access in nested loops
- Minimal Mustache implementation (bundled, no external deps)

**Example:**
```mustache
Release: {{latest_public_release}}
{{#apis}}
  * {{file_name}} v{{version}}
{{/apis}}
```

**Reusability:** Fully reusable. Any campaign can use this with different templates and data structures.

---

### replace-delimited-content

**Scope:** Generic (reusable across campaigns)

Replaces content between delimiters with new content from a file.

**Inputs:**
- `file` - Target file to modify
- `start` - Start delimiter
- `end` - End delimiter
- `new_content_file` - File containing new content

**Outputs:**
- `changed` - "true" if content was modified, "false" if identical

**Behavior:**
- Finds delimiters in target file
- Replaces everything between them with content from `new_content_file`
- Preserves delimiters themselves
- Detects if content already identical (for idempotency)

**Reusability:** Fully reusable. Any campaign managing delimited sections can use this action.

---

## Finalization Action (Composite)

### campaign-finalize-per-repo

**Scope:** Generic (reusable across all campaigns)

**Type:** Composite action (YAML-defined steps, no compilation needed)

**Purpose:** Handles all generic campaign infrastructure: PR detection, commit, PR creation, outcome recording, and artifacts. Separates generic logic from campaign-specific workflows.

**Inputs:**
- `mode` - "plan" or "apply"
- `changed` - "true" or "false" (from git diff)
- `repo` - Repository slug (e.g., "camaraproject/DeviceLocation")
- `campaign_data` - JSON with campaign-specific fields (e.g., `{"latest_public_release":"r3.2","api_count":3}`)
- `pr_base_title` - Base PR title (date+sequence added automatically)
- `pr_body_file` - Path to rendered PR body file (apply mode)
- `branch` - Branch name pattern (unique per run)
- `github_token` - GitHub token for PR operations
- `error_occurred` - "true" if error occurred (optional)
- `error_message` - Error description (optional)
- `error_step` - Step where error occurred (optional)

**Steps:**

1. **Detect existing PR** (skipped if error occurred)
   - Searches for PRs by base title + "automated" label
   - Finds newest PR by `created_at` date
   - Captures PR number, URL, branch name
   - Uses `gh pr list` with JSON output

2. **Two-stage change detection** (skipped if error occurred)
   - Stage 1: Compare against main (`git diff --quiet`)
   - Stage 2: If PR exists, compare against PR branch
   - Outputs: `changed` (true/false), `reason` (new_changes/duplicate_of_pr/main_up_to_date)

3. **Generate PR title** (skipped if error occurred)
   - Format: `{base_title} (YYYY-MM-DD-NNN)`
   - Searches for existing PRs with same date
   - Increments sequence number (001, 002, 003)
   - Uses UTC date

4. **Determine PR status** (skipped if error occurred)
   - `will_create` - Changes detected
   - `no_change` - Content identical

5. **Warn about outdated PR** (apply mode, if main up-to-date and old PR exists)
   - Adds warning comment to old PR
   - Message: "This PR appears outdated"
   - Includes workflow run link

6. **Ensure automated label** (apply mode, if creating PR)
   - Checks if "automated" label exists
   - Creates label if missing
   - Color: `d1d5db`, Description: "Automated bulk operations"

7. **Commit to branch** (apply mode, if changed)
   - Configure git user as `github-actions[bot]`
   - Create unique branch: `{branch_pattern}-{run_id}`
   - Add README.md
   - Commit with PR title as message
   - Push to origin

8. **Create PR** (apply mode, if changed)
   - Call `gh pr create` with:
     - Generated title (with date/sequence)
     - Body from file
     - Head: unique branch
     - Base: main
     - Label: automated
     - Status: ready for review (not draft)
   - Capture PR URL from output

9. **Mark old PR as superseded** (apply mode, if new PR created and old PR exists)
   - Add warning comment to old PR
   - Message: "This PR has been superseded by #{new_pr}"
   - Convert old PR to draft (`gh pr ready --undo`)

10. **Record outcome** (always runs, even with errors)
    - Run Node.js script (`dist/index.js`)
    - Generate JSONL record with:
      - Repository name
      - PR status and metadata
      - Campaign data
      - Error information (if applicable)
      - Timestamp
    - Generate markdown summary
    - Write to plan.jsonl/results.jsonl and plan.md/results.md

11. **Reset repo** (plan mode only)
    - `git reset --hard`
    - `git clean -fd`
    - Ensures no changes persist

12. **Upload artifacts**
    - Upload plan/results files
    - Naming: `plan-{run_id}-{job-index}` or `results-{run_id}-{job-index}`

**Error Handling:**
- All PR-related steps skip when `error_occurred=true`
- Outcome recording always runs to capture errors
- Error details included in JSONL/markdown output

**Why Composite:**
- Encapsulates all generic campaign infrastructure
- Campaign workflows can't accidentally modify core logic
- Reusable across all campaigns without code changes
- No compilation needed (pure YAML + bundled Node script)
- Updates apply to all campaigns automatically

**Reusability:** Fully reusable. Any bulk campaign can use this action by providing campaign-specific data in the `campaign_data` input.

---

## Template System

**Scope:** Campaign-specific (each campaign has its own templates)

**Location:** `campaigns/release-info/templates/`

### release-info.mustache

Main content template for the Release Information section.

**Variables:**
- `repo_name` - Repository name
- `latest_public_release` - Release tag (e.g., "r3.2")
- `release_date` - ISO 8601 date
- `meta_release` - Meta-release name (e.g., "Fall25")
- `github_url` - Full release URL
- `apis[]` - Array of API objects:
  - `api_name` - API name
  - `file_name` - YAML filename (without extension)
  - `version` - API version
  - `title` - API title
  - `commonalities` - Commonalities version

**Features:**
- Multi-API support via array iteration
- Links to YAML, ReDoc, and Swagger UI viewers
- Parent context access (`{{repo_name}}` inside `{{#apis}}` loop)

### pr-body.mustache

PR description template.

**Variables:** Same as release-info.mustache

**Purpose:** Provides context about the automated update in the PR description.

---

## Adapting for New Campaigns

### Generic Actions (Use As-Is)
These actions require no changes for new campaigns:
- `ensure-delimited-section` - Different delimiters per campaign
- `render-mustache` - Different templates per campaign
- `replace-delimited-content` - Different delimiters per campaign
- `campaign-finalize-per-repo` - Different campaign_data per campaign

### Campaign-Specific Actions
Create new actions for:
- **Data reading** - If data source differs from releases-master.yaml
- **Custom processing** - If transformation logic needed beyond templating

### Example: New Contributing Campaign

**Reuse:**
- `ensure-delimited-section` - Different delimiters: `<!-- CAMARA:CONTRIBUTING:START/END -->`
- `render-mustache` - Different template: `contributing.mustache`
- `replace-delimited-content` - Same action, different delimiters
- `campaign-finalize-per-repo` - Same action, different campaign_data

**Create:**
- `read-contributing-data` - Custom action if data source differs
- Or: Use static data in workflow if no external source needed

**Template:**
- `campaigns/contributing/templates/contributing.mustache`

**Workflow:**
- Copy `campaign-release-info.yml` → `campaign-contributing.yml`
- Update env: delimiters, template paths, PR title
- Update campaign_data fields
- Reuse all actions

---

## Development

### Rebuilding Node20 Actions

Actions with TypeScript sources:
```bash
cd actions/{action-name}
npm install
npm run build  # Compiles src/index.ts → dist/index.js
git add dist/
```

### Testing Actions

Test actions in isolation:
```bash
# Set inputs as env vars
export INPUT_FILE=test.md
export INPUT_START="<!-- START -->"
export INPUT_END="<!-- END -->"
export INPUT_PLACEHOLDER="placeholder"

# Run action
node actions/ensure-delimited-section/dist/index.js
```

### Composite Action Development

Edit YAML directly - no compilation needed:
```bash
vim actions/campaign-finalize-per-repo/action.yml
# Changes apply immediately to workflows
```
