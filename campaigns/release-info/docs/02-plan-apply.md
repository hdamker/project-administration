# Plan vs Apply

- `MODE=plan`:
  - Write changes into the clone.
  - Detect differences with `git diff`.
  - Record:
    - human summary: `plan.md`
    - machine lines: `plan.jsonl`
  - Clean the working tree with `git reset --hard && git clean -fd`.

- `MODE=apply`:
  - Same writes.
  - Commit to stable branch (e.g. `bulk/release-info-sync`).
  - Create/Update PR.

**Never** create draft PRs in plan mode.
