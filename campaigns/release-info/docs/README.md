# Release Information Campaign

This campaign automatically updates the "Release Information" section in README.md files across CAMARA API repositories with the latest public release details.

## Purpose

Maintains consistent and up-to-date release information across all CAMARA API repositories, including:
- Latest public release tag and link
- API versions and specifications
- Links to YAML definitions and API viewers (ReDoc, Swagger UI)
- References to CHANGELOG and other releases

## Usage

### Plan Mode (Dry Run)

Test the campaign without making any changes:

1. Navigate to [Actions → campaign-release-info](../../.github/workflows/campaign-release-info.yml)
2. Click "Run workflow"
3. Ensure `MODE` is set to `plan` (default)
4. Optionally set `INCLUDE` to test specific repos (e.g., `"DeviceLocation,QualityOnDemand"`)
5. Run the workflow
6. Review the generated `plan.md` and `plan.jsonl` artifacts

**Plan mode behavior:**
- Writes changes to target repo clones
- Detects existing PRs and their status
- Compares changes against PR branch (or main if no PR)
- Creates plan artifacts (`plan.md` + `plan.jsonl`) with PR status
- Resets working tree (`git reset --hard && git clean -fd`)
- **Does NOT create any PRs**

### Apply Mode (Create PRs)

Apply changes and create pull requests:

1. Test with a small set of repos first using `INCLUDE`
2. Change `MODE` to `apply` in the workflow
3. Run the workflow
4. PRs will be created with dated titles (e.g., `[bulk] Sync Release Information section (2025-10-28-001)`)
5. Verify PRs in target repositories

**Apply mode behavior:**
- Detects newest existing PR by base title for comparison
- Compares changes against newest PR branch (or main if no PR)
- Commits changes to unique branch with run ID
- Always creates new PR when changes are detected
- Multiple PRs may exist; codeowners close old ones after review
- Generates `results.md` and `results.jsonl` artifacts with PR URLs

## Configuration

Edit [.github/workflows/campaign-release-info.yml](../../.github/workflows/campaign-release-info.yml):

```yaml
env:
  MODE: plan                        # Switch to 'apply' when ready
  ORG: camaraproject
  RELEASES_FILE: data/releases-master.yaml
  INCLUDE: ""                       # Filter: "DeviceLocation,QualityOnDemand"
  BRANCH: bulk/release-info-sync-${{ github.run_id }}  # Unique branch per run
  PR_TITLE: "[bulk] Sync Release Information section"  # Date added automatically
  PR_BODY: "Automated update of README Release Information section"
```

## PR Status Values

The campaign tracks PR status for each repository in both plan and apply modes:

- **`will_create`** - Changes detected; new PR would be/was created
- **`no_change`** - Content identical to newest PR (or main); no update needed (idempotent)

**Example plan.md output:**
```
### hdamker/QualityOnDemand
- WOULD apply
- PR status: New PR would be created
- latest_public_release: r3.2
- api_count: 3
```

**Example results.md output:**
```
### hdamker/QualityOnDemand
- apply
- PR status: New PR would be created
- PR URL: https://github.com/hdamker/QualityOnDemand/pull/11
- latest_public_release: r3.2
- api_count: 3
```

**Example results.jsonl:**
```json
{"repo":"hdamker/QualityOnDemand","pr_would_be_created":true,"reason":"content_changed","latest_public_release":"r3.2","api_count":3,"timestamp":"2025-10-28T19:33:51.262Z","pr_status":"will_create","pr_url":"https://github.com/hdamker/QualityOnDemand/pull/11"}
```

## PR Handling

The campaign creates new PRs when changes are detected:

### Multiple PRs
- Always creates a new PR when changes exist
- PR title includes date and sequence: `[bulk] Sync Release Information section (2025-10-28-001)`
- Sequence number increments for multiple runs on same day (001, 002, 003, ...)
- Multiple open PRs possible; codeowners should close old PRs after reviewing new ones

### PR Detection
- Searches for PRs by base title `[bulk] Sync Release Information section`
- Finds newest PR by creation date for comparison
- Compares working directory against newest PR branch (or main if no PR)

### Idempotency
- Compares content against newest PR branch
- Skips PR creation if content is identical
- Status set to `no_change`
- No duplicate PRs for identical content

## Template

Located at [campaigns/release-info/templates/release-info.mustache](../templates/release-info.mustache)

### Template Variables

- `repo_name`: Repository name (e.g., "DeviceLocation")
- `latest_public_release`: Latest public release tag (e.g., "r3.2")
- `release_date`: Release date (ISO 8601)
- `meta_release`: Meta-release name (e.g., "Fall25")
- `github_url`: Full GitHub release URL
- `apis[]`: Array of APIs in the release
  - `api_name`: API name
  - `file_name`: YAML filename (without .yaml extension)
  - `version`: API version
  - `title`: API title
  - `commonalities`: Commonalities version

### Multi-API Support

The template uses Mustache array iteration to list all APIs:

```mustache
{{#apis}}
  * **{{file_name}} v{{version}}**
  [[YAML]](https://github.com/camaraproject/{{repo_name}}/blob/{{latest_public_release}}/code/API_definitions/{{file_name}}.yaml)
  ...
{{/apis}}
```

## Data Source

The campaign reads from `data/releases-master.yaml`, which contains:

```yaml
releases:
  - repository: DeviceLocation
    release_tag: r3.2
    release_date: '2025-09-16T11:41:00Z'
    meta_release: Fall25
    github_url: https://github.com/camaraproject/DeviceLocation/releases/tag/r3.2
    apis:
      - api_name: geofencing-subscriptions
        file_name: geofencing-subscriptions
        version: 0.5.0
        title: Device Geofencing Subscriptions
        commonalities: '0.6'
      [... more APIs ...]
```

### Latest Public Release Logic

The `read-release-data` action:
1. Filters releases by repository name
2. **Excludes sandbox releases**: `meta_release` containing "Sandbox" or "None (Sandbox)"
3. Sorts by semver (release_tag like "r3.2" → "3.2")
4. Selects the latest (highest version)
5. Outputs all APIs from that release

## Actions Used

This campaign uses 5 reusable actions (located in `actions/`):

### 1. [read-release-data](../../actions/read-release-data/)
- Parses `releases-master.yaml`
- Filters by repository and public status
- Sorts by semver to find latest
- Outputs JSON for templating

**Inputs:**
- `releases_file`: Path to releases-master.yaml
- `repo_slug`: Full repository slug (e.g., "camaraproject/DeviceLocation")

**Outputs:**
- `json`: Full data object for Mustache (includes all APIs)
- `summary`: Minimal JSON for plan reporting (latest_public_release, api_count)

### 2. [ensure-delimited-section](../../actions/ensure-delimited-section/)
- Ensures delimited section exists in README.md
- Inserts after first `## ` heading if missing
- Idempotent (no changes if already present)

**Inputs:**
- `file`: Target file (e.g., "README.md")
- `start`: Start delimiter comment
- `end`: End delimiter comment
- `placeholder`: Placeholder text

### 3. [render-mustache](../../actions/render-mustache/)
- Renders Mustache template with JSON data
- Supports array iteration (`{{#apis}}...{{/apis}}`)
- Parent context access for nested data

**Inputs:**
- `template`: Mustache template path
- `data_json`: JSON string or file path
- `out_file`: Output file path

### 4. [replace-delimited-content](../../actions/replace-delimited-content/)
- Replaces content between delimiters
- Outputs `changed` flag (true/false)

**Inputs:**
- `file`: Target file
- `start`: Start delimiter
- `end`: End delimiter
- `new_content_file`: File with new content

### 5. [campaign-finalize-per-repo](../../actions/campaign-finalize-per-repo/)
- Generic finalization action for all campaigns (composite action)
- Handles PR detection, commit, push, PR creation, outcome recording, artifacts
- Self-contained: all generic logic separated from campaign-specific workflow

**Key Features:**
- Detects existing PRs and captures number/URL
- Analyzes commit authors to detect codeowner modifications
- Determines PR status (will_create, will_update, no_change, modified_skip, push_failed)
- Uses `--force-with-lease` for safe updates
- Skips repos with codeowner changes
- Records outcome to plan.jsonl/results.jsonl with PR metadata
- Generates plan.md/results.md with PR status
- Uploads artifacts (plan/results)

**Inputs:**
- `mode`: plan or apply
- `changed`: Whether changes detected
- `repo`: Repository name
- `campaign_data`: Campaign-specific JSON data
- `pr_title`: PR title (apply mode)
- `pr_body_file`: Path to rendered PR body (apply mode)
- `branch`: PR branch name
- `github_token`: Token for PR operations

**Internal Steps:**
1. Detect existing PR (gh pr list)
2. Check PR branch for codeowner commits
3. Determine PR status based on PR existence, changes, codeowner commits
4. Commit and push (apply mode, if not modified_skip)
5. Create/update PR (apply mode, if will_create or will_update)
6. Record outcome with PR metadata
7. Reset repo (plan mode)
8. Upload artifacts

## Adapting for New Campaigns

The actions in `actions/` are reusable for other campaigns:

**Example: Update Contributing Sections**
1. Copy workflow: `campaign-release-info.yml` → `campaign-contributing.yml`
2. Create template: `campaigns/contributing/templates/contributing.mustache`
3. Update workflow to use new template path
4. Reuse existing actions (ensure-delimited-section, render-mustache, replace-delimited-content)
5. Optionally create custom action if different data source needed

**Key Principles:**
- Actions are generic and parameterized
- Campaign-specific logic goes in templates
- Data sources can be YAML, JSON, or API calls
- Keep diff/PR/aggregation logic unchanged in workflow

## Troubleshooting

### No public releases found
**Cause:** Repository only has sandbox releases (meta_release = "None (Sandbox)")
**Solution:** Wait for public release or exclude repo from campaign

### Delimiters not found
**Cause:** `ensure-delimited-section` didn't run or failed
**Solution:** Check action logs, verify README.md exists

### Template rendering errors
**Cause:** Invalid Mustache syntax or missing data fields
**Solution:** Test template with sample data, check action logs

### PRs not created in apply mode
**Cause:** No changes detected (content already up-to-date) or PR already exists
**Solution:** Check results.md for PR status:
- `no_change` - Content identical to PR branch (expected, idempotent)
- `modified_skip` - PR has codeowner commits (protected from overwrite)
- `will_update` - PR was updated (check PR link in results)

### PR was skipped with modified_skip status
**Cause:** PR branch has commits from codeowners (not bot)
**Solution:** This is protection against overwriting manual changes. Options:
1. Review codeowner changes in the PR
2. Manually merge or update the PR
3. Close PR and delete branch to allow fresh PR creation

### Push failed with push_failed status
**Cause:** Remote branch changed between detection and push
**Solution:** Rare race condition. Rerun workflow - will detect new state

## References

- [ADR 0001: Campaign Architecture](ADR/0001-campaign-architecture.md)
- [Workflow Overview](00-overview.md)
- [Plan vs Apply](02-plan-apply.md)
- [Actions Documentation](04-actions.md)
