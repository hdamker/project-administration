# ADR-0001: Campaign Architecture

## Status
Accepted

## Context
Previous "bulk v2" design evolved into an orchestrator with conditional steps, custom ops, and playbooks. It overlapped with native GitHub Actions features and increased maintenance burden.

## Decision
- Use **one workflow per campaign**, configured via committed `env:` values and repo lists in the repo itself.
- Implement per‑repo logic as small **Node20 actions** (TS → dist committed).
- **Plan** writes into the clone, uses `git diff`, emits `plan.md` + `plan.jsonl`, and resets – **no PR**.
- **Apply** commits to a **stable branch** and opens/updates PR.
- Keep **diff/PR/reporting/aggregation** logic fixed so new campaigns only touch per‑repo actions and templates.

## Consequences
- Lower cognitive load; no custom orchestrator.
- Clear audit trail via commits/PRs.
- Easy to copy campaigns; predictable behavior.
