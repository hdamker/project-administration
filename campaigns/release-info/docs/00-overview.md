# Overview

This scaffold implements a minimal, JS/TS‑only pattern for **bulk campaign** changes across CAMARA repositories.

## Flow
1. **select**: build a list of target repositories from `data/releases-master.yaml` (+ optional `INCLUDE` filter).
2. **run (matrix)**: for each repository:
   - `read-release-data`: resolve the data model for templating (latest public release, API version, etc.).
   - `ensure-delimited-section`: ensure the managed section exists in `README.md`.
   - `render-mustache`: render `templates/release-info.mustache` with the resolved data.
   - `replace-delimited-content`: write the rendered content between delimiters.
   - **plan/apply**:
     - **plan**: `git diff` → append lines to `plan.jsonl` and blocks to `plan.md`, then `git reset --hard && git clean -fd`.
     - **apply**: commit to a **stable branch** and open/update a PR.

3. **aggregate**: merge all per‑repo plan artifacts to a single `plan.md` and `plan.jsonl`.

## Invariants
- **Plan** never creates PRs or leaves changes in the working tree.
- **Apply** uses a stable branch per campaign → idempotent per repo.
- The **diff/PR/reporting/aggregation** logic is fixed in the workflow; if per‑repo steps output the right data, you don't need to touch aggregation.
