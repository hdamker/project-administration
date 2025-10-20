# Operations Development Guide

Comprehensive guide for developing custom operations for the CAMARA Bulk Orchestrator.

## Table of Contents

1. [Overview](#overview)
2. [Operation Contract](#operation-contract)
3. [TypeScript Operations](#typescript-operations)
4. [Python Operations](#python-operations)
5. [Operation Types](#operation-types)
6. [Testing Operations](#testing-operations)
7. [Best Practices](#best-practices)
8. [Common Patterns](#common-patterns)

---

## Overview

Operations are the building blocks of the bulk orchestrator. Each operation defines how to inspect and modify repositories across the CAMARA organization.

**Operation Lifecycle:**
1. **Plan Phase**: Determine what changes would be made (dry-run)
2. **Apply Phase**: Actually apply the changes (if `plan_only: false`)

**Key Principles:**
- **Idempotent**: Running the same operation multiple times produces the same result
- **Declarative**: Operations declare what should be true, not how to get there
- **Safe**: Plan phase never mutates state (except file-based ops write to disk for git diff)

---

## Operation Contract

All operations (TypeScript or Python) must implement the plan/apply contract.

### TypeScript Contract

```typescript
import { OpContext, Repo, PlanResult, ApplyResult } from "../sdk/context.js";

export const op = {
  id: "operation-name@v1",
  describe: (inputs: any) => "Human-readable description",

  async plan(ctx: OpContext, repo: Repo): Promise<PlanResult> {
    // Inspect repository, determine what would change
    // Return outcome: "noop", "would_apply", or "error"
  },

  async apply(ctx: OpContext, repo: Repo, plan: PlanResult): Promise<ApplyResult> {
    // Actually apply the changes
    // Return outcome: "noop", "applied", or "error"
  }
};
```

### PlanResult

```typescript
type PlanResult = {
  outcome: "noop" | "would_apply" | "error";
  details?: any;           // Optional: any JSON-serializable data
  message?: string;        // Optional: human-readable message
};
```

**Outcomes:**
- `noop` - No changes needed, repository already in desired state
- `would_apply` - Changes would be applied in apply mode
- `error` - Operation failed (logged, counted as error)

### ApplyResult

```typescript
type ApplyResult = {
  outcome: "noop" | "applied" | "error";
  details?: any;
  message?: string;
};
```

**Outcomes:**
- `noop` - No changes needed (same as plan)
- `applied` - Changes were successfully applied
- `error` - Apply failed

---

## TypeScript Operations

TypeScript operations have full access to the orchestrator SDK and GitHub API.

### Minimal Example

```typescript
// src/ops/example.hello.ts
import { OpContext, Repo, PlanResult, ApplyResult } from "../sdk/context.js";
import * as core from "@actions/core";

export const op = {
  id: "example.hello@v1",
  describe: (inputs: any) => `Say hello to ${inputs.name || "world"}`,

  async plan(ctx: OpContext, repo: Repo): Promise<PlanResult> {
    const name = ctx.inputs.name || "world";
    core.info(`👋 Would say hello to ${name} in ${repo.fullName}`);

    return {
      outcome: "would_apply",
      details: { greeting: `Hello, ${name}!` }
    };
  },

  async apply(ctx: OpContext, repo: Repo, plan: PlanResult): Promise<ApplyResult> {
    if (plan.outcome === "error") {
      return { outcome: "error", message: plan.message };
    }

    const greeting = plan.details?.greeting || "Hello!";
    core.info(`👋 ${greeting}`);

    return {
      outcome: "applied",
      details: plan.details
    };
  }
};
```

### OpContext API

The `OpContext` object provides access to orchestrator services:

```typescript
type OpContext = {
  // GitHub API client
  octokit: Octokit;

  // GitHub token for authentication
  token: string;

  // Is this plan mode (true) or apply mode (false)?
  planOnly: boolean;

  // Full playbook configuration
  playbook: Playbook;

  // Path to cloned repository worktree (undefined if not cloned yet)
  workdir: string | undefined;

  // Operation inputs from playbook
  inputs: any;

  // File system operations (requires worktree)
  fs: {
    readText(path: string): Promise<string>;
    writeText(path: string, content: string): Promise<void>;
  };

  // Template rendering (Mustache)
  renderTemplate(
    source?: string,        // Inline template
    filePath?: string,      // Or path to template file
    view?: any              // Variables for template
  ): Promise<string>;

  // Environment info
  env: {
    actor: string;      // GitHub user who triggered workflow
    runId: number;      // Workflow run ID
    runUrl: string;     // URL to workflow run
  };
};
```

### File System Operations

**Reading files:**
```typescript
async plan(ctx: OpContext, repo: Repo): Promise<PlanResult> {
  if (!ctx.workdir) {
    throw new NeedsWorktreeError("Operation requires worktree");
  }

  const content = await ctx.fs.readText("README.md");
  // Process content...
}
```

**Writing files:**
```typescript
async plan(ctx: OpContext, repo: Repo): Promise<PlanResult> {
  if (!ctx.workdir) {
    throw new NeedsWorktreeError("Operation requires worktree");
  }

  // Write during plan phase for git diff detection
  await ctx.fs.writeText("config.json", JSON.stringify(config, null, 2));

  return { outcome: "would_apply" };
}

async apply(ctx: OpContext, repo: Repo, plan: PlanResult): Promise<ApplyResult> {
  // File already written during plan - just return success
  return { outcome: "applied" };
}
```

### GitHub API Operations

**Listing issues:**
```typescript
const issues = await ctx.octokit.issues.listForRepo({
  owner: repo.owner,
  repo: repo.name,
  state: "open"
});

for (const issue of issues.data) {
  core.info(`Issue #${issue.number}: ${issue.title}`);
}
```

**Creating pull requests:**
```typescript
const pr = await ctx.octokit.pulls.create({
  owner: repo.owner,
  repo: repo.name,
  title: "Automated update",
  head: "feature-branch",
  base: repo.defaultBranch,
  body: "This PR was created by bulk orchestrator"
});

return {
  outcome: "applied",
  details: { prUrl: pr.data.html_url }
};
```

### Registration

Add your operation to the `TS_OPS` registry in `index.ts`:

```typescript
// src/index.ts
import { op as exampleHello } from "./ops/example.hello.js";

const TS_OPS: Record<string, any> = {
  [filePatch.id]: filePatch,
  [issueCreate.id]: issueCreate,
  [exampleHello.id]: exampleHello  // Add your operation
};
```

---

## Python Operations

Python operations are simpler but have less access to orchestrator internals. They communicate via stdin/stdout JSON.

### Contract

**Input (stdin):**
```json
{
  "repo": {
    "owner": "camaraproject",
    "name": "QualityOnDemand",
    "fullName": "camaraproject/QualityOnDemand",
    "defaultBranch": "main"
  },
  "inputs": {
    "custom_param": "value"
  },
  "mode": "plan"
}
```

**Output (stdout):**
```json
{
  "changes": [
    {"path": "file.txt", "before": "old", "after": "new"}
  ],
  "rows": [
    {"file": "api.yaml", "version": "1.0.0"}
  ],
  "notes": ["Found 3 API files"]
}
```

### Example: File Analyzer

```python
#!/usr/bin/env python3
# bulk/ops-local/python/analyze_apis.py

import sys
import json
import glob
import yaml

def main():
    # Read input
    payload = json.load(sys.stdin)
    inputs = payload.get("inputs", {})
    patterns = inputs.get("patterns", ["**/*.yaml"])

    # Process files
    results = []
    for pattern in patterns:
        for filepath in glob.glob(pattern, recursive=True):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    doc = yaml.safe_load(f)

                if not isinstance(doc, dict):
                    continue

                info = doc.get("info", {})
                results.append({
                    "file": filepath,
                    "title": info.get("title", "Unknown"),
                    "version": info.get("version", "Unknown")
                })
            except Exception as e:
                print(f"Error processing {filepath}: {e}", file=sys.stderr)

    # Output results
    output = {
        "rows": results,
        "notes": [f"Analyzed {len(results)} API files"]
    }
    print(json.dumps(output))

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        sys.exit(1)
```

**Usage in playbook:**
```yaml
ops:
  - use: "bulk/ops-local/python/analyze_apis.py"
    with:
      patterns:
        - "code/API_definitions/*.yaml"
        - "code/API_definitions/**/*.yaml"
```

### Python Best Practices

1. **Always validate input:**
```python
if "repo" not in payload:
    raise ValueError("Missing 'repo' in input")
```

2. **Use mode parameter:**
```python
mode = payload.get("mode", "plan")
if mode == "plan":
    # Calculate what would change
    changes = compute_changes()
elif mode == "apply":
    # Actually write files
    apply_changes()
```

3. **Handle file encoding:**
```python
with open(path, "r", encoding="utf-8") as f:
    content = f.read()
```

4. **Silent failures for missing files:**
```python
try:
    with open(path, "r") as f:
        process(f)
except FileNotFoundError:
    pass  # Skip silently
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
```

---

## Operation Types

### File-Based Operations

Operations that modify files in the repository.

**Characteristics:**
- Require repository clone (worktree)
- Throw `NeedsWorktreeError` if worktree not available
- Write changes during **plan phase** for git diff detection
- Apply phase is idempotent (files already written)

**Example:**
```typescript
export const op = {
  id: "file.modify@v1",

  async plan(ctx: OpContext, repo: Repo): Promise<PlanResult> {
    // Request worktree if not available
    if (!ctx.workdir) {
      throw new NeedsWorktreeError("file.modify@v1 requires worktree");
    }

    // Read file
    const content = await ctx.fs.readText("config.json");
    const config = JSON.parse(content);

    // Modify
    config.version = "2.0.0";
    const newContent = JSON.stringify(config, null, 2);

    // Check if changed
    if (content === newContent) {
      return { outcome: "noop" };
    }

    // Write during plan for git diff
    await ctx.fs.writeText("config.json", newContent);

    return { outcome: "would_apply" };
  },

  async apply(ctx: OpContext, repo: Repo, plan: PlanResult): Promise<ApplyResult> {
    // File already written during plan
    if (plan.outcome === "noop") {
      return { outcome: "noop" };
    }
    return { outcome: "applied" };
  }
};
```

### API-Only Operations

Operations that only use GitHub API (no file modifications).

**Characteristics:**
- No repository clone needed
- Faster execution (no git operations)
- Perfect for issues, labels, repository settings

**Example:**
```typescript
export const op = {
  id: "label.create@v1",

  async plan(ctx: OpContext, repo: Repo): Promise<PlanResult> {
    // No worktree needed - pure API operation
    const labelName = ctx.inputs.name;
    const labelColor = ctx.inputs.color || "ededed";

    try {
      // Check if label exists
      const existing = await ctx.octokit.issues.listLabelsForRepo({
        owner: repo.owner,
        repo: repo.name
      });

      const found = existing.data.find(l => l.name === labelName);

      if (found) {
        if (found.color === labelColor) {
          return { outcome: "noop", message: "Label already exists" };
        }
        return { outcome: "would_apply", message: "Would update label color" };
      }

      return { outcome: "would_apply", message: "Would create label" };
    } catch (e: any) {
      return { outcome: "error", message: e.message };
    }
  },

  async apply(ctx: OpContext, repo: Repo, plan: PlanResult): Promise<ApplyResult> {
    if (plan.outcome === "noop") {
      return { outcome: "noop" };
    }

    const labelName = ctx.inputs.name;
    const labelColor = ctx.inputs.color || "ededed";

    try {
      if (plan.message?.includes("create")) {
        await ctx.octokit.issues.createLabel({
          owner: repo.owner,
          repo: repo.name,
          name: labelName,
          color: labelColor
        });
        return { outcome: "applied", message: "Created label" };
      } else {
        await ctx.octokit.issues.updateLabel({
          owner: repo.owner,
          repo: repo.name,
          name: labelName,
          color: labelColor
        });
        return { outcome: "applied", message: "Updated label color" };
      }
    } catch (e: any) {
      return { outcome: "error", message: e.message };
    }
  }
};
```

### Hybrid Operations

Operations that conditionally require worktree.

**Example:** `issue.create@v1` with optional file template:
```typescript
async plan(ctx: OpContext, repo: Repo): Promise<PlanResult> {
  // Only need worktree if using file-based template
  if (ctx.inputs.bodyTemplatePath && !ctx.workdir) {
    throw new NeedsWorktreeError("Requires worktree for bodyTemplatePath");
  }

  // If using inline template, no worktree needed
  // ...
}
```

---

## Testing Operations

### Manual Testing

1. **Create test playbook:**
```yaml
# test-my-operation.yaml
version: 1
selector:
  include: ["your-username/test-repo"]
strategy:
  mode: "pr"
  plan: true
  concurrency: 1
ops:
  - use: "my.operation@v1"
    with:
      param: "value"
```

2. **Run in plan mode:**
```bash
cd bulk/action
npm run build
# Test via GitHub Actions workflow
```

3. **Check outputs:**
```bash
# Download artifacts
gh run download <run-id>
cat plan.md
jq . results.jsonl
```

### Unit Testing (Future)

*Note: No testing framework currently exists - see IMPLEMENTATION_ISSUES.md #2*

Future test structure:
```typescript
// ops/my.operation.test.ts
import { createMockContext } from "../testing/mock";
import { op } from "./my.operation";

test("returns noop when no changes needed", async () => {
  const ctx = createMockContext({ inputs: { param: "value" } });
  const result = await op.plan(ctx, mockRepo);
  expect(result.outcome).toBe("noop");
});
```

---

## Best Practices

### 1. Idempotency

**Do:**
```typescript
// Check current state before applying
const existing = await getExistingResource();
if (existing.matches(desired)) {
  return { outcome: "noop" };
}
```

**Don't:**
```typescript
// Always apply, creating duplicates
await createResource();
return { outcome: "applied" };
```

### 2. Error Handling

**Do:**
```typescript
try {
  const result = await ctx.octokit.issues.create(...);
  return { outcome: "applied", details: { url: result.data.html_url } };
} catch (e: any) {
  core.error(`Failed to create issue: ${e.message}`);
  return { outcome: "error", message: e.message };
}
```

**Don't:**
```typescript
// Let errors crash the operation
const result = await ctx.octokit.issues.create(...);
```

### 3. Logging

**Do:**
```typescript
core.info(`🔍 Checking for existing label "${labelName}"`);
core.info(`✅ Label found: ${existing.color}`);
core.info(`⏭️  No changes needed`);
```

**Don't:**
```typescript
console.log("checking label");  // Use core.info instead
```

### 4. Input Validation

**Do:**
```typescript
const title = ctx.inputs.title;
if (!title || !title.trim()) {
  return {
    outcome: "error",
    message: "Required field 'title' is missing or empty"
  };
}
```

### 5. Details Object

**Do:**
```typescript
return {
  outcome: "would_apply",
  details: {
    action: "would_create",
    issue: 42,
    url: "https://github.com/...",
    changedFields: ["body", "labels"]
  }
};
```

These details appear in `results.jsonl` for debugging.

---

## Common Patterns

### Pattern: Search and Update

```typescript
// Find existing resource by unique key
const existing = await findExistingResource(uniqueKey);

if (!existing) {
  return { outcome: "would_apply", details: { action: "create" } };
}

// Compare current vs desired state
const changed = hasChanges(existing, desired);
if (!changed) {
  return { outcome: "noop", details: { action: "already_current" } };
}

return { outcome: "would_apply", details: { action: "update" } };
```

### Pattern: Conditional Worktree

```typescript
async plan(ctx: OpContext, repo: Repo): Promise<PlanResult> {
  // Check if worktree is actually needed
  const needsWorktree = ctx.inputs.useFileTemplate || ctx.inputs.processFiles;

  if (needsWorktree && !ctx.workdir) {
    throw new NeedsWorktreeError("Operation requires worktree for file operations");
  }

  // Continue with or without worktree
  // ...
}
```

### Pattern: Batch Processing

```typescript
const files = await fg(globs, { cwd: ctx.workdir });
let changedCount = 0;

for (const file of files) {
  const content = await ctx.fs.readText(file);
  const modified = processContent(content);

  if (modified !== content) {
    await ctx.fs.writeText(file, modified);
    changedCount++;
  }
}

return {
  outcome: changedCount > 0 ? "would_apply" : "noop",
  details: { changedFiles: changedCount }
};
```

### Pattern: Template Rendering

```typescript
const body = await ctx.renderTemplate(
  ctx.inputs.bodyTemplate,          // Inline template (optional)
  ctx.inputs.bodyTemplatePath,      // File template (optional)
  {
    repo,
    actor: ctx.env.actor,
    custom: ctx.inputs.customVar
  }
);

if (!body || !body.trim()) {
  return { outcome: "error", message: "Template rendered empty body" };
}
```

---

## Operation Versioning

Operations use semantic versioning in their ID:

- `operation-name@v1` - Version 1 (stable)
- `operation-name@v2` - Version 2 (breaking changes)

**Breaking changes** (require new version):
- Changing required input fields
- Changing outcome behavior significantly
- Removing functionality

**Non-breaking changes** (keep same version):
- Adding optional input fields
- Improving error messages
- Performance improvements
- Bug fixes

---

## Examples

See existing operations for reference:
- [file.patch.ts](../action/src/ops/file.patch.ts) - File-based operation with glob matching
- [issue.create.ts](../action/src/ops/issue.create.ts) - Hybrid API/file operation

See Python operations:
- [collect_yaml_has_wip.py](../ops-local/python/collect_yaml_has_wip.py) - Stats collection

---

## Next Steps

1. Study existing operations in `action/src/ops/`
2. Create your operation following the contract
3. Register in `index.ts` (TypeScript) or reference by path (Python)
4. Test with a small playbook in plan mode
5. Iterate based on results
6. Share your operation via PR or documentation

For more examples, see [cookbook.md](cookbook.md).
