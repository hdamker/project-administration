# Troubleshooting Guide

Common issues and solutions for the CAMARA Bulk Orchestrator.

## Table of Contents

1. [Setup and Configuration](#setup-and-configuration)
2. [Playbook Errors](#playbook-errors)
3. [Repository Selection Issues](#repository-selection-issues)
4. [Operation Errors](#operation-errors)
5. [Performance Issues](#performance-issues)
6. [Output and Results](#output-and-results)

---

## Setup and Configuration

### Error: GITHUB_TOKEN not provided

**Symptom:**
```
Error: GITHUB_TOKEN not provided
```

**Cause:** Environment variable `GITHUB_TOKEN` or `GH_TOKEN` not set.

**Solution:**
1. Add token to workflow environment:
```yaml
env:
  GITHUB_TOKEN: ${{ secrets.CAMARA_BULK_CHANGE_TOKEN }}
```

2. Verify secret exists in repository settings:
   - Go to Settings → Secrets and variables → Actions
   - Check `CAMARA_BULK_CHANGE_TOKEN` exists

3. If using Fine-Grained Personal Access Token:
   - Ensure token has not expired
   - Verify permissions: Contents (Read and Write), Pull requests (Read and Write)

---

### Error: Permission to owner/repo.git denied

**Symptom:**
```
remote: Permission to hdamker/QualityOnDemand.git denied
fatal: unable to access 'https://github.com/...': The requested URL returned error: 403
```

**Cause:** Token doesn't have write access to the repository.

**Solution:**

**For Fine-Grained PAT:**
1. Go to https://github.com/settings/tokens?type=beta
2. Find your token
3. Edit → Permissions
4. Verify:
   - **Contents**: Read and write ✅
   - **Pull requests**: Read and write ✅
   - **Issues**: Read and write ✅ (if creating issues)
5. Save changes

**For Classic PAT:**
- Ensure `repo` scope is selected

**For Organization tokens:**
- Contact organization admin to grant repository access

---

### Error: Cannot find dist/index.js

**Symptom:**
```
Error: Cannot find module 'dist/index.js'
```

**Cause:** TypeScript not compiled to JavaScript.

**Solution:**
```bash
cd bulk/action
npm ci
npm run build
git add dist/
git commit -m "Build action"
```

**Why commit dist/?** GitHub Actions cannot run TypeScript directly - they need compiled JavaScript.

---

## Playbook Errors

### Error: Playbook validation failed

**Symptom:**
```
Playbook validation failed: /strategy/diffPolicy must be equal to one of the allowed values
```

**Cause:** Playbook doesn't match JSON schema.

**Common Issues:**

**1. Invalid diffPolicy value:**
```yaml
# ❌ Wrong
strategy:
  diffPolicy: "ignore-whitespace-all"

# ✅ Correct
strategy:
  diffPolicy: "ignore-whitespace"
```

Valid values: `strict`, `ignore-eol`, `ignore-whitespace`

**2. Missing required fields:**
```yaml
# ❌ Wrong - missing required fields
version: 1
strategy:
  mode: "pr"
ops:
  - use: "file.patch@v1"

# ✅ Correct
version: 1
selector:
  query: "org:camaraproject"
strategy:
  mode: "pr"
  plan: true
  concurrency: 6
ops:
  - use: "file.patch@v1"
    with:
      globs: ["*.md"]
      replace: []
```

**3. Deprecated properties:**
```yaml
# ❌ Wrong - strategy.issue was removed
strategy:
  mode: "pr"
  issue:
    enabled: true

# ✅ Correct - use issue.create@v1 operation instead
ops:
  - use: "issue.create@v1"
    with:
      title: "Issue title"
      bodyTemplate: "Issue body"
```

**Validate playbook manually:**
```bash
cd bulk/action
npx ajv-cli validate \
  -s src/schemas/playbook.schema.json \
  -d ../../playbooks/your-playbook.yaml
```

---

### Error: Unknown operation

**Symptom:**
```
Error: Unknown op: my.operation@v1
```

**Cause:** Operation not registered or doesn't exist.

**Solutions:**

**For TypeScript operations:**
1. Check operation file exists: `action/src/ops/my.operation.ts`
2. Verify registration in `index.ts`:
```typescript
import { op as myOperation } from "./ops/my.operation.js";

const TS_OPS: Record<string, any> = {
  [filePatch.id]: filePatch,
  [issueCreate.id]: issueCreate,
  [myOperation.id]: myOperation  // Must be registered here
};
```
3. Rebuild: `npm run build`

**For Python operations:**
1. Check file path is correct relative to workspace root
2. Verify file exists: `bulk/ops-local/python/my_operation.py`
3. Check file is executable: `chmod +x bulk/ops-local/python/my_operation.py`

---

## Repository Selection Issues

### No Repositories Selected

**Symptom:**
```
Final repository count: 0
```

**Causes and Solutions:**

**1. Invalid search query:**
```yaml
# ❌ Wrong syntax
selector:
  query: "camaraproject archived:false"

# ✅ Correct
selector:
  query: "org:camaraproject archived:false"
```

Test query in GitHub:
```bash
# Test search query directly
gh search repos "org:camaraproject archived:false" --limit 5
```

**2. Include filter too restrictive:**
```yaml
selector:
  query: "org:camaraproject"
  include:
    - "camaraproject/NonExistentRepo"  # Typo
```

Remove include filter temporarily to see what's found:
```yaml
selector:
  query: "org:camaraproject"
  # include: []  # Comment out to test
```

**3. has_files filter:**
```yaml
selector:
  has_files: [".github/workflows/specific.yml"]
```

**Note:** `has_files` only filters **after** repository is cloned. If no repos match, they were excluded before cloning (by query/include/exclude).

Check in plan.md which repos were found before has_files filtering.

---

### Repository Skipped with "no matching has_files"

**Symptom:**
```
⏭️  Skipping owner/repo: no matching has_files
```

**Cause:** Repository doesn't contain required files.

**Solutions:**

**1. Verify file paths:**
```yaml
# Check file exists in repository
has_files:
  - ".github/workflows/mega-linter.yml"  # Typo? Should be megalinter.yml
```

**2. Use glob patterns:**
```yaml
# Match any workflow file
has_files:
  - ".github/workflows/*.yml"
```

**3. Remove filter if not needed:**
```yaml
selector:
  query: "org:camaraproject"
  # has_files: []  # Remove if all repos should be processed
```

---

## Operation Errors

### Error: file.patch@v1 requires git worktree

**Symptom:**
```
Error: file.patch@v1 requires git worktree
```

**Cause:** This error should trigger automatic repository cloning. If you see this error, it means cloning failed.

**Solution:**

**1. Check repository access:**
- Verify token has read access to the repository
- Check repository isn't private (unless token has access)

**2. Check disk space:**
```bash
df -h  # In Actions runner
```

**3. Check network connectivity:**
- Transient network issues can cause clone failures
- Re-run the workflow

**Note:** If cloning works, you shouldn't see this error - it's caught and handled internally.

---

### Error: issue.create@v1 - Issue body is empty

**Symptom:**
```
Error: Issue body is empty (check bodyTemplate or bodyTemplatePath)
```

**Causes and Solutions:**

**1. Template variables not expanded:**
```yaml
# ❌ Wrong - variables must use Mustache syntax
bodyTemplate: "Created by $actor"

# ✅ Correct
bodyTemplate: "Created by {{actor}}"
```

**2. Template file not found:**
```yaml
# ❌ Wrong - relative to wrong location
bodyTemplatePath: "templates/issue.md"

# ✅ Correct - relative to workspace root
bodyTemplatePath: "bulk/templates/issue-default.md"
```

**3. Template file is actually empty:**
```bash
# Check file content
cat bulk/templates/your-template.md
```

---

### Python operation exits with error

**Symptom:**
```
Error: python exited 1: ModuleNotFoundError: No module named 'yaml'
```

**Cause:** Python dependencies not installed.

**Solution:**

**Install dependencies in workflow:**
```yaml
- name: Install Python dependencies
  run: pip install pyyaml
```

**Or use standard library only:**
```python
import json  # ✅ Built-in
import glob  # ✅ Built-in
import yaml  # ❌ Requires pyyaml
```

---

## Performance Issues

### Rate Limit Errors

**Symptom:**
```
Error: API rate limit exceeded
```

**Cause:** Too many GitHub API requests too quickly.

**Solutions:**

**1. Reduce concurrency:**
```yaml
strategy:
  concurrency: 3  # Lower from default 6
```

**2. Use authentication:**
- Authenticated requests have higher rate limits (5000/hour vs 60/hour)
- Verify `GITHUB_TOKEN` is set

**3. Run during off-peak hours:**
- GitHub rate limits reset hourly
- Try again later or schedule for off-peak times

**4. Use API-only operations sparingly:**
- Each issue.create operation makes multiple API calls
- Batch operations when possible

---

### Workflow runs too slow

**Symptom:** Workflow takes hours to complete.

**Diagnosis:**

**Check what's slow:**
1. Look at workflow logs - which step takes longest?
2. Check if repositories are cloning (git operations are slow)
3. Check concurrency setting

**Solutions:**

**For API-only operations:**
```yaml
strategy:
  concurrency: 15  # Increase for API-only
```

**For file operations:**
```yaml
strategy:
  concurrency: 5  # Keep moderate for git operations
```

**For mixed operations:**
- First operation triggers clone if needed
- Subsequent operations reuse worktree
- Concurrency: 5-6 is optimal

**For selective processing:**
```yaml
# Process fewer repositories
selector:
  include:
    - "camaraproject/Repo1"
    - "camaraproject/Repo2"
```

---

## Output and Results

### Results files not generated

**Symptom:** Artifacts don't contain expected files.

**Check:**

**1. Workflow completed successfully:**
```bash
gh run list --limit 1
gh run view <run-id>
```

**2. Upload artifact step ran:**
```yaml
- name: Upload results
  if: always()  # Run even if orchestrator failed
  uses: actions/upload-artifact@v4
  with:
    name: bulk-results
    path: |
      results.jsonl
      results.html
      plan.md
```

**3. Files exist before upload:**
```yaml
- name: List results
  run: ls -la *.md *.jsonl *.html
```

---

### plan.md shows "error" but no details

**Symptom:**
```
| owner/repo | ❌ | error | - | |
```

**Solution:** Check workflow logs for detailed error:
```bash
gh run view <run-id> --log | grep "❌"
```

Error details are logged but summarized in plan.md. Check:
1. JSONL file (has full error message in `notes` field)
2. Workflow logs (has stack trace and detailed errors)
3. HTML viewer (shows per-operation error details)

---

### HTML viewer shows "No data"

**Symptom:** Opening results.html shows empty state.

**Cause:** HTML file was generated but JSONL was empty.

**Check:**
```bash
# Download artifacts
gh run download <run-id>

# Check JSONL content
jq . results.jsonl
```

If JSONL is empty:
- No repositories were processed
- Check repository selection (see "No Repositories Selected" above)

---

## Getting Help

### Enable Debug Logging

Add to workflow for more detailed logs:
```yaml
env:
  ACTIONS_STEP_DEBUG: true
```

Re-run workflow and check logs:
```bash
gh run view <run-id> --log
```

### Check Example Playbooks

See working examples:
```bash
ls bulk/playbooks/
```

- `test1.yaml` - Basic file patch
- `test2.yaml` - Issue creation
- `test3.yaml` - Multiple operations
- `test4.yaml` - API-only across multiple repos

### Review Documentation

- [README.md](../action/README.md) - Overview and usage
- [operations-guide.md](operations-guide.md) - Writing custom operations
- [cookbook.md](cookbook.md) - Example recipes
- [architecture.md](architecture.md) - How it works

### Report Issues

If issue persists:
1. Gather diagnostics:
   - Playbook YAML
   - Workflow logs
   - plan.md and results.jsonl (if generated)
2. Check existing issues: https://github.com/camaraproject/project-administration/issues
3. Open new issue with diagnostics

---

## Quick Reference

### Common Commands

**Test playbook locally:**
```bash
cd bulk/action
npm run build
# Use GitHub workflow to test
```

**Validate playbook schema:**
```bash
cd bulk/action
npx ajv-cli validate -s src/schemas/playbook.schema.json -d ../../playbooks/your-playbook.yaml
```

**Check token permissions:**
```bash
# For your personal token
gh auth status

# For organization token
# Contact organization admin
```

**Download and inspect results:**
```bash
gh run list --limit 5
gh run download <run-id>
cat plan.md
jq . results.jsonl | head -20
open results.html
```

### Status Indicators

| Emoji | Meaning | Action |
|-------|---------|--------|
| ✅ | Success | Review PR/issue |
| ⏭️ | Skipped | No action needed (no changes) |
| ❌ | Error | Check logs and fix |

### Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | All repos succeeded | Review results, merge PRs |
| 1 | At least one repo failed | Check plan.md for errors |

---

## Still Stuck?

1. **Read the error message carefully** - it usually tells you what's wrong
2. **Check workflow logs** - more details than plan.md
3. **Simplify playbook** - test with single repo first
4. **Use plan mode** - `plan_only: true` is safe to test
5. **Ask for help** - CAMARA community or GitHub issues
