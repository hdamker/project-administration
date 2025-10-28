# Plan vs Apply

## Plan Mode

- `MODE=plan`:
  - Write changes into the clone.
  - Detect existing PRs and analyze status.
  - Compare changes against PR branch (or main if no PR).
  - Detect differences with `git diff`.
  - Record:
    - human summary: `plan.md` (with PR status and URLs)
    - machine lines: `plan.jsonl` (with PR metadata)
  - Clean the working tree with `git reset --hard && git clean -fd`.
  - **Never** creates PRs.

**Example plan.md:**
```
### camaraproject/QualityOnDemand
- WOULD apply
- PR status: Existing PR would be updated (PR #42)
- PR URL: https://github.com/camaraproject/QualityOnDemand/pull/42
- latest_public_release: r3.2
- api_count: 3
```

**Example plan.jsonl:**
```json
{"repo":"camaraproject/QualityOnDemand","pr_would_be_created":false,"reason":"content_changed","pr_status":"will_update","pr_would_be_updated":true,"pr_number":42,"pr_url":"https://github.com/camaraproject/QualityOnDemand/pull/42","latest_public_release":"r3.2","api_count":3,"timestamp":"2025-10-28T19:33:51.262Z"}
```

## Apply Mode

- `MODE=apply`:
  - Same writes and PR detection as plan mode.
  - Compare changes against PR branch (not main).
  - Skip repos where codeowners have modified the PR (`modified_skip`).
  - Skip repos where content is identical (`no_change`).
  - Commit to stable branch (e.g. `bulk/release-info-sync`).
  - Push with `--force-with-lease` (safe force push).
  - Create/Update PR via `gh` CLI.
  - Record:
    - human summary: `results.md` (with PR status and URLs)
    - machine lines: `results.jsonl` (with PR metadata)

**Example results.md (modified_skip):**
```
### camaraproject/QoSBooking
- skip
- PR status: Existing PR can't be updated - modified by codeowner (PR #8)
- PR URL: https://github.com/hdamker/QoSBooking/pull/8
- latest_public_release: r1.2
- api_count: 2
```

**Example results.jsonl (no_change):**
```json
{"repo":"camaraproject/QualityOnDemand","pr_would_be_created":false,"reason":"noop","pr_status":"no_change","pr_number":9,"pr_url":"https://github.com/camaraproject/QualityOnDemand/pull/9","latest_public_release":"r3.2","api_count":3,"timestamp":"2025-10-28T19:47:08.715Z"}
```

## PR Status Values

Both modes track PR status for each repository:

- **`will_create`** - No existing PR; new PR would be/was created
- **`will_update`** - Existing PR with bot-only commits; would be/was updated safely
- **`no_change`** - Existing PR with identical content; no update needed (idempotent)
- **`modified_skip`** - Existing PR has codeowner commits; skipped to protect manual changes
- **`push_failed`** - Push rejected by `--force-with-lease`; concurrent changes detected (rare)

## Safety Features

### Codeowner Protection
- Analyzes commit authors on PR branch before updating
- Skips repos where PR has commits from users (not `github-actions[bot]`)
- Status: `modified_skip`

### Idempotency
- Compares working directory against existing PR branch (not main)
- Skips push if content is identical
- Status: `no_change`

### Safe Force Push
- Uses `--force-with-lease` instead of `--force`
- Prevents overwriting concurrent changes
- Status: `push_failed` if rejected
