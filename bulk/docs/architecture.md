# Bulk Orchestrator v2 - Technical Architecture

Technical architecture documentation for contributors and maintainers.

## Table of Contents

1. [System Overview](#system-overview)
2. [Execution Model](#execution-model)
3. [Lazy Worktree Pattern](#lazy-worktree-pattern)
4. [Operation Lifecycle](#operation-lifecycle)
5. [Result Aggregation](#result-aggregation)
6. [Change Detection](#change-detection)
7. [Concurrency Model](#concurrency-model)
8. [Output Formats](#output-formats)
9. [Error Handling](#error-handling)
10. [Design Decisions](#design-decisions)

---

## System Overview

The bulk orchestrator is a TypeScript GitHub Action that executes operations across multiple repositories based on YAML playbook configurations.

**Key Components:**
```
┌─────────────────────────────────────────────────────────────┐
│ GitHub Actions Workflow (bulk-run.yaml)                     │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ Bulk Orchestrator (index.ts)                                │
│  ├── Playbook Parser & Validator (Ajv JSON Schema)         │
│  ├── Repository Selector (GitHub Search API)               │
│  ├── Worker Pool (Concurrency Control)                     │
│  └── Output Generators (JSONL, HTML, Markdown)             │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼──────┐  ┌─────────▼────────┐  ┌──────▼──────┐
│ TypeScript   │  │ Python           │  │ GitHub API  │
│ Operations   │  │ Operations       │  │ Operations  │
│ (file.patch) │  │ (custom scripts) │  │ (issues/PR) │
└──────────────┘  └──────────────────┘  └─────────────┘
```

**Data Flow:**
```
Playbook YAML
    ↓
Schema Validation
    ↓
Repository Selection (GitHub Search)
    ↓
Filter (include/exclude/has_files)
    ↓
Worker Pool (Process N repos concurrently)
    ↓
Per-Repo: Operations → Plan → Apply
    ↓
Aggregate Results
    ↓
Output Files (JSONL, HTML, Markdown)
```

---

## Execution Model

### Plan/Apply Pattern

Inspired by Terraform, the orchestrator uses a two-phase execution model:

**Plan Phase** (`plan_only: true`):
- Reads repository state
- Determines what changes would be made
- NO mutations (except file operations write for git diff)
- Reports "would_apply" or "noop"
- Safe to run anytime

**Apply Phase** (`plan_only: false`):
- Actually applies changes
- Creates commits, pushes branches
- Creates/updates PRs and issues
- Reports "applied" or "noop"
- Requires review of plan.md first

**Workflow:**
```
User triggers workflow → Plan mode → Review plan.md
                                           ↓
                          User approves → Apply mode → Changes made
```

### Worker Pool Concurrency

```typescript
async function worker() {
  while (i < repos.length) {
    const repo = repos[i++];  // Atomic counter increment
    // Process repository...
  }
}

// Spawn N workers
await Promise.all(
  Array(concurrency).fill(0).map(() => worker())
);
```

**Characteristics:**
- Simple work-stealing pattern
- No explicit queue needed
- Workers grab next repository atomically
- Configurable concurrency (default: 6)

---

## Lazy Worktree Pattern

**Problem:** Not all operations need repository clones. Cloning 100 repos just to create issues is wasteful.

**Solution:** Clone on-demand when operations request it.

### Flow

```
1. Start operation WITHOUT worktree
   ↓
2. Operation runs
   ↓ (needs files?)
   ↓ NO → Continue (API-only)
   │
   ↓ YES
   │
3. Operation throws NeedsWorktreeError
   ↓
4. Orchestrator catches error
   ↓
5. Clone repository (shallow, single branch)
   ↓
6. Check has_files filter (if any)
   ↓ (matches?)
   ↓ NO → Skip repository
   │
   ↓ YES
   │
7. Create work branch (if apply mode)
   ↓
8. Retry operation WITH worktree
   ↓
9. Continue with remaining operations (reuse worktree)
```

### Code Example

```typescript
// Operation declares: "I need a worktree"
async plan(ctx: OpContext, repo: Repo): Promise<PlanResult> {
  if (!ctx.workdir) {
    throw new NeedsWorktreeError("file.patch@v1 requires worktree");
  }
  // ... use ctx.workdir
}

// Orchestrator catches and clones
try {
  plan = await op.plan(ctx, repo);
} catch (e) {
  if (e instanceof NeedsWorktreeError) {
    // Clone repository
    workdir = await cloneShallow(repoFull, tmpRoot, defaultBranch);
    // Retry with worktree
    ctx = makeCtx(..., workdir, ...);
    plan = await op.plan(ctx, repo);
  }
}
```

### Benefits

- **Performance**: API-only playbooks never clone (10x faster)
- **Efficiency**: Mixed playbooks only clone when needed
- **Flexibility**: Operations decide if they need worktree
- **Simplicity**: Declarative (throw error vs explicit "please clone")

---

## Operation Lifecycle

### Unified Contract

All operations implement the same contract:

```typescript
interface Operation {
  id: string;
  describe: (inputs: any) => string;
  plan(ctx: OpContext, repo: Repo): Promise<PlanResult>;
  apply(ctx: OpContext, repo: Repo, plan: PlanResult): Promise<ApplyResult>;
}
```

### Outcome Codes

**Plan Phase:**
- `noop` - No changes needed, skip this operation
- `would_apply` - Changes would be made in apply mode
- `error` - Operation failed

**Apply Phase:**
- `noop` - No changes needed (same as plan)
- `applied` - Changes successfully applied
- `error` - Apply failed

### Write-During-Plan Pattern

**Problem:** How to detect file changes without committing in plan mode?

**Traditional Approach (incorrect):**
```
Plan: Calculate changes in memory → return "would_apply"
Apply: Write changes to disk → git diff shows changes
```

**Issue:** Plan mode can't use `git diff` to detect meaningful changes (whitespace, EOL, etc.)

**v2 Solution (write-during-plan):**
```
Plan: Write changes to disk → git diff detects meaningful changes → return "would_apply"
Apply: Files already written → just commit them → return "applied"
```

**Benefits:**
- Can use `git diff --ignore-space-at-eol` in plan mode
- diffPolicy works correctly
- Apply phase is idempotent (files already written)

**Implementation:**
```typescript
async plan(ctx: OpContext, repo: Repo): Promise<PlanResult> {
  const content = await ctx.fs.readText("file.txt");
  const modified = content.replace("old", "new");

  // WRITE DURING PLAN
  await ctx.fs.writeText("file.txt", modified);

  return { outcome: "would_apply" };
}

async apply(ctx: OpContext, repo: Repo, plan: PlanResult): Promise<ApplyResult> {
  // File already written during plan - just report success
  return { outcome: "applied" };
}
```

---

## Result Aggregation

### Per-Operation Tracking

Each operation execution is tracked separately:

```typescript
type OperationResult = {
  op: string;            // "file.patch@v1"
  plan: PlanResult;      // {outcome: "would_apply", details: {...}}
  apply?: ApplyResult;   // {outcome: "applied", details: {...}} (if apply mode)
};

const perOpResults: OperationResult[] = [];
```

### Aggregate Outcome Logic

**Plan Mode:**
```
if (any operation has error) → "error"
else if (any operation has would_apply) → "ok_would_apply"
else if (all operations are noop) → "ok_noop"
```

**Apply Mode:**
```
if (any operation has error) → "error"
else if (any operation has applied) → "ok_applied"
else if (all operations are noop) → "ok_noop"
```

**Code:**
```typescript
function aggregateOutcome(
  perOpResults: OperationResult[],
  planOnly: boolean,
  repoFailed: boolean
): string {
  if (repoFailed) return "error";

  if (planOnly) {
    const hasWouldApply = perOpResults.some(r => r.plan.outcome === "would_apply");
    const allNoop = perOpResults.every(r => r.plan.outcome === "noop");
    const hasError = perOpResults.some(r => r.plan.outcome === "error");

    if (hasError) return "error";
    if (hasWouldApply) return "ok_would_apply";
    if (allNoop) return "ok_noop";
  } else {
    const hasApplied = perOpResults.some(r => r.apply?.outcome === "applied");
    const allNoop = perOpResults.every(r => r.apply?.outcome === "noop");
    const hasError = perOpResults.some(r => r.apply?.outcome === "error");

    if (hasError) return "error";
    if (hasApplied) return "ok_applied";
    if (allNoop) return "ok_noop";
  }

  return "ok_noop";
}
```

### Change Status Determination

**For file-based operations (with worktree):**
```
if (git status shows changes) {
  if (hasMeaningfulChanges(diffPolicy)) {
    changeStatus = "would apply"  // (plan mode)
    changeStatus = "applied"      // (apply mode)
  } else {
    changeStatus = "would skip (diffPolicy)"  // e.g., whitespace only
  }
} else {
  changeStatus = "no changes"
}
```

**For API-only operations (no worktree):**
```
changeStatus = aggregateOutcome(perOpResults)
  ok_would_apply → "would apply"
  ok_applied → "applied"
  ok_noop → "no changes"
  error → (changeStatus reflects error in notes)
```

---

## Change Detection

### Git Diff Strategies

Three `diffPolicy` options control what constitutes a "meaningful" change:

**strict:**
```bash
git diff --exit-code  # Any change, including whitespace
```

**ignore-eol** (default):
```bash
git diff --ignore-space-at-eol --exit-code
```

**ignore-whitespace:**
```bash
git diff --ignore-all-space --exit-code
```

### Implementation

```typescript
async function hasMeaningfulChanges(
  workdir: string,
  policy: string
): Promise<boolean> {
  const opts = { cwd: workdir };

  switch (policy) {
    case "strict":
      return hasChanges(workdir);  // Any change

    case "ignore-eol":
      const { exitCode } = await exec("git", [
        "diff",
        "--ignore-space-at-eol",
        "--exit-code"
      ], opts);
      return exitCode !== 0;

    case "ignore-whitespace":
      const { exitCode } = await exec("git", [
        "diff",
        "--ignore-all-space",
        "--exit-code"
      ], opts);
      return exitCode !== 0;
  }
}
```

### Use Cases

| Policy | Detects | Use When |
|--------|---------|----------|
| `strict` | All changes | Makefiles, YAML (whitespace matters) |
| `ignore-eol` | Content + whitespace | Cross-platform repos (CRLF/LF) |
| `ignore-whitespace` | Content only | Code formatters (prettier, black) |

---

## Concurrency Model

### Simple Worker Pool

```typescript
let i = 0;
async function worker() {
  while (i < repos.length) {
    const repo = repos[i++];
    await processRepository(repo);
  }
}

// N workers process M repos
await Promise.all(
  Array(concurrency).fill(0).map(() => worker())
);
```

**Characteristics:**
- No explicit queue/semaphore
- Atomic increment of shared counter
- Workers self-terminate when repos exhausted
- Simple, effective, no dependencies

### Concurrency Considerations

**File-based operations:**
- Git clone/push/commit are I/O heavy
- Recommended: concurrency 3-6

**API-only operations:**
- Pure HTTP requests
- Recommended: concurrency 10-15

**Mixed playbooks:**
- Use conservative concurrency (5-6)
- First operation triggers clone if needed
- Subsequent operations reuse worktree

---

## Output Formats

### results.jsonl (Machine-Readable)

One JSON object per line (JSONL format):

```json
{
  "timestamp": "2025-10-20T10:30:00.000Z",
  "repo": "owner/repo",
  "aggregate": {
    "outcome": "ok_applied",
    "changeStatus": "applied",
    "prUrl": "https://github.com/...",
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

**Benefits:**
- Streamable (one line per repository)
- Parseable by standard tools (`jq`, `grep`)
- Contains per-operation details for debugging
- Aggregate outcome for summary views

### results.html (Interactive Viewer)

Self-contained HTML file with embedded CSS and JavaScript:

**Generation:**
```typescript
const viewerTemplate = await fs.readFile("viewer-template.html", "utf-8");
const viewerHtml = viewerTemplate.replace(
  "const DATA = [];",
  `const DATA = ${JSON.stringify(results, null, 2)};`
);
await fs.writeFile("results.html", viewerHtml);
```

**Features:**
- Summary statistics (total, success, errors, no changes)
- Filter by repository name and outcome
- Expandable per-repository cards
- Per-operation details with plan and apply phases
- Raw JSON toggle for debugging
- No external dependencies (works offline)

### plan.md (Human-Readable)

Markdown summary with emoji indicators:

```markdown
# Bulk Orchestrator Plan

## Playbook
- File: playbooks/example.yaml
- Mode: Plan
- Repositories: 10

## Results

| Repository | Status | Change Status | PR | Notes |
|------------|--------|---------------|----|----|
| owner/repo1 | ✅ | would apply | [#123](https://...) | |
| owner/repo2 | ⏭️ | no changes | - | |
| owner/repo3 | ❌ | error | - | File not found |

## Summary
- Total: 10
- Success: 8
- Errors: 1
- Skipped: 1
```

---

## Error Handling

### Error Types

**Playbook Validation Errors:**
```typescript
const validate = ajv.compile(schema);
if (!validate(playbook)) {
  throw new Error(`Playbook validation failed: ${errors}`);
}
```
**Result:** Workflow fails immediately, no repositories processed.

**Repository Processing Errors:**
```typescript
try {
  // Process repository
} catch (e) {
  status = "error";
  notes = e.message;
  // Continue to next repository (unless failFast)
}
```
**Result:** Repository marked as error, counted in summary.

**Operation Errors:**
```typescript
plan = await op.plan(ctx, repo);
if (plan.outcome === "error") {
  repoFailed = true;
  // Continue to next operation (unless failFast)
}
```
**Result:** Operation marked as error in results, repository marked as failed.

### Fail-Fast Mode

```yaml
strategy:
  failFast: true
```

**Behavior:**
```typescript
if (repoFailed && playbook.strategy.failFast) {
  core.setFailed(`Fail-fast triggered by error in ${repoFull}`);
  process.exit(1);
}
```

**Use when:**
- Testing new playbooks
- Critical changes where partial application is unacceptable
- Debugging issues

**Default:** `failFast: false` (process all repos, report errors at end)

### Exit Codes

```typescript
if (failedCount > 0) {
  core.setFailed(`${failedCount} repositories failed`);
  process.exit(1);
}
```

- Exit 0: All repositories succeeded
- Exit 1: At least one repository failed OR validation error

---

## Design Decisions

### Why Write During Plan?

**Decision:** File operations write to disk during plan phase.

**Rationale:**
1. Need to use `git diff` for change detection
2. diffPolicy requires actual git diff (can't simulate in memory)
3. Enables accurate "would_apply" vs "noop" distinction
4. Makes apply phase idempotent (files already written)

**Tradeoff:** Plan mode has side effects (file writes), but:
- Only writes to temporary worktree (never committed)
- Enables accurate change detection
- Worth the tradeoff for correctness

### Why Lazy Worktree?

**Decision:** Clone repositories on-demand, not upfront.

**Alternatives considered:**
1. Always clone all repos → Wasteful for API-only operations
2. Analyze playbook, pre-determine which need clones → Complex, error-prone
3. Lazy on-demand cloning → Simple, correct, efficient ✅

**Rationale:**
- Operations know best whether they need worktree
- `NeedsWorktreeError` is declarative and simple
- API-only playbooks get 10x speedup
- No complex pre-analysis needed

### Why Per-Operation Result Tracking?

**Decision:** Track plan and apply results for each operation separately.

**Alternatives considered:**
1. Only track aggregate outcome → Harder to debug multi-op playbooks
2. Track only in plan.md → Not machine-readable
3. Per-operation tracking in JSONL → Debuggable, machine-readable ✅

**Rationale:**
- Multi-operation playbooks are common
- Need to debug "which operation failed?"
- JSONL can store detailed per-op results
- Aggregate outcome for summary views

### Why Three Output Formats?

**Decision:** Generate JSONL, HTML, and Markdown.

**Rationale:**
- **JSONL:** Machine-readable, parseable, streamable
- **HTML:** Interactive browser view, good UX
- **Markdown:** GitHub-native, inline in Actions output

Each serves a different purpose.

### Why Not CSV?

**Decision:** Removed CSV output in v2.

**Rationale:**
- Can't represent per-operation details (CSV is flat)
- JSONL is better for machine parsing
- HTML viewer replaces CSV for human browsing
- Reduces confusion (fewer output formats)

---

## Future Considerations

See [IMPLEMENTATION_ISSUES.md](../../private-dev-docs/project-administration/bulk-v2/IMPLEMENTATION_ISSUES.md) for improvement opportunities:

- Auto-discover operations (reduce registration boilerplate)
- Operation testing framework (faster development)
- Conditional operations (when clauses)
- Input schema validation per operation
- Smart concurrency (API-only vs file-based)

---

## References

- [operations-guide.md](operations-guide.md) - How to write operations
- [development.md](development.md) - Developer setup
- [cookbook.md](cookbook.md) - Example playbooks
- Source code: [action/src/](../action/src/)
