# Actions (per‑repo steps)

## Content Actions (Node20)

All Node20 actions are TypeScript compiled to `dist/index.js` and committed.

- `read-release-data`
  Inputs: `releases_file`, `repo_slug`
  Outputs:
    - `json` – stringified data for templating (Mustache).
    - `summary` – small JSON with `latest_public_release` and `api_count` for reporting.

- `ensure-delimited-section`
  Inputs: `file`, `start`, `end`, `placeholder`
  Ensures the delimited section exists; writes only if missing.

- `render-mustache`
  Inputs: `template`, `data_json`, `out_file`
  Renders Mustache template to file. (Minimal Mustache implementation bundled – `{{key}}` and sections.)

- `replace-delimited-content`
  Inputs: `file`, `start`, `end`, `new_content_file`
  Replaces text between delimiters with the rendered content. Outputs `changed=true|false`.

These actions are intentionally tiny and composable. Extend inside TS and rebuild `dist/`.

## Finalization Action (Composite)

- `campaign-finalize-per-repo`
  **Purpose**: Generic finalization for all campaigns (PR detection, commit, PR creation, recording, artifacts).
  **Type**: Composite action (YAML-defined steps, no compilation needed).
  **Inputs**:
    - `mode` – "plan" or "apply"
    - `changed` – "true" or "false" (from git diff)
    - `repo` – Repository slug (e.g., "camaraproject/DeviceLocation")
    - `campaign_data` – JSON with campaign-specific fields (e.g., `{"latest_public_release":"r3.2","api_count":3}`)
    - `pr_title` – PR title (apply mode)
    - `pr_body_file` – Path to rendered PR body (apply mode)
    - `branch` – Target branch name
    - `github_token` – GitHub token for PR operations

  **Behavior**:
  1. **Detect existing PR**: Calls `gh pr list` to check if PR exists for branch, captures number and URL
  2. **Check codeowner commits**: Fetches PR branch, analyzes commit authors (`git log`), detects non-bot commits
  3. **Determine status**:
     - `will_create` – No PR, changes detected
     - `will_update` – PR exists, bot-only commits, changes detected
     - `no_change` – PR exists, no changes (idempotent)
     - `modified_skip` – PR exists, has codeowner commits (protected)
     - `push_failed` – Push rejected by --force-with-lease
  4. **Commit and push** (apply mode, if not modified_skip):
     - Creates/checks out branch
     - Commits with PR title as message
     - Pushes with `--force-with-lease` (safe force push)
  5. **Create/update PR** (apply mode, if will_create or will_update):
     - Calls `gh pr create` with title, body, draft status
     - Captures PR URL from output
  6. **Record outcome**:
     - Runs Node script to generate plan.jsonl/results.jsonl (machine-readable)
     - Generates plan.md/results.md (human-readable) with PR status and URL
     - Includes all campaign_data fields in both formats
  7. **Reset** (plan mode): `git reset --hard && git clean -fd`
  8. **Upload artifacts**: Uploads plan/results with run-specific names

  **Why Composite**:
  - Encapsulates all generic campaign infrastructure
  - Campaign workflows can't accidentally modify core logic
  - Reusable across all campaigns without code changes
  - No compilation needed (pure YAML + bundled Node script)
