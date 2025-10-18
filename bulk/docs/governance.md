# Governance

Guidelines for CAMARA bulk operations including DCO, CLA, approvals, and safety controls.

## DCO (Developer Certificate of Origin)

All commits created by the bulk orchestrator include the **Signed-off-by** trailer per DCO requirements.

### Implementation

Commits are created with `git commit -s`:

```bash
git commit -s -m "[bulk] playbook-name"
```

**Resulting commit**:
```
[bulk] playbook-name

Signed-off-by: camara-bot <camara-bot@users.noreply.github.com>
```

### Configuration

Set bot identity via environment variables:

```yaml
env:
  GIT_USER_NAME: "camara-bot"
  GIT_USER_EMAIL: "camara-bot@users.noreply.github.com"
```

## CLA (Contributor License Agreement)

### EasyCLA Bot

CAMARA repositories use the EasyCLA bot for CLA verification.

**Bot Account**: Use a dedicated bot account (e.g., `camara-bot`) that has signed the CLA.

**Token**: `CAMARA_BULK_CHANGE_TOKEN` should be associated with the bot account.

### Verification

The EasyCLA bot checks commits and PRs. Since the bot account has signed the CLA, all bulk PRs will pass CLA checks automatically.

## Approval Process

### Who Can Run Bulk Operations?

Access is controlled by GitHub repository/environment permissions:

1. **Repository Secret**: `CAMARA_BULK_CHANGE_TOKEN` is stored as a repository or environment secret
2. **Workflow Dispatch**: Only users with write access can trigger workflow_dispatch events
3. **Environment Protection**: Use GitHub environments for additional approval requirements

### Recommended Setup

```yaml
# .github/workflows/bulk-run.yaml
jobs:
  bulk:
    runs-on: ubuntu-latest
    environment: bulk-operations  # Require environment approval
    permissions:
      contents: write
      pull-requests: write
      issues: write
```

**Environment bulk-operations** can have:
- Required reviewers (e.g., Release Management team)
- Wait timer
- Deployment branches (e.g., only from main)

## PR vs Direct Mode

### PR Mode (Default, Recommended)

```yaml
strategy:
  mode: "pr"
```

**Advantages**:
- Changes are reviewed before merging
- CI/CD runs on PR
- Can be rejected or modified
- Clear audit trail

**Use for**:
- All production repositories
- Breaking changes
- Configuration updates
- Dependency updates

### Direct Mode (Use Sparingly)

```yaml
strategy:
  mode: "direct"
```

**Commits directly to default branch** - **No PR created**.

**Advantages**:
- Faster for trivial changes
- Useful for stats collection

**Use for**:
- Stats-only operations (no file changes)
- Emergency hotfixes (with approval)
- Sandbox repositories

**Never use for**:
- Working group repositories (Governance, ReleaseManagement, etc.)
- API repositories with active development
- Changes requiring review

## Labels

Standard labels for bulk operations:

- `bulk-change`: All automated bulk PRs
- `dependencies`: Dependency updates
- `ci`: CI/CD changes
- `governance`: Governance-related changes
- `automated`: Marks as automated (optional)

### Configuration

```yaml
strategy:
  pr:
    labels: ["bulk-change", "dependencies"]
```

## Reviewers

### Assign Reviewers

```yaml
strategy:
  pr:
    reviewers: ["hdamker", "maintainer-name"]
```

**Best Practice**: Always assign at least one reviewer for production changes.

### Auto-Approval

**Not recommended**. Even for bulk changes, manual review catches:
- Unexpected side effects
- Merge conflicts
- Breaking changes

## Visibility and Audit Trail

### Run Initiator

All PR and issue bodies include:
- **Actor**: GitHub user who triggered the workflow
- **Run URL**: Link to the GitHub Actions run

**Example**:
```markdown
Triggered by: @hdamker
Run: https://github.com/camaraproject/project-administration/actions/runs/123456
```

### Artifacts

Every run produces artifacts for audit:
- `results.csv` - Machine-readable results
- `plan.md` - Human-readable summary
- `results.jsonl` - Detailed logs with timestamps

### Workflow Logs

GitHub Actions logs are retained per repository settings (default 90 days).

## Safety Controls

### 1. Plan Mode Default

Workflows default to `plan_only: true`:

```yaml
inputs:
  plan_only:
    default: "true"
```

**Forces explicit opt-in** for apply mode.

### 2. Fail-Fast Option

```yaml
strategy:
  failFast: true  # Stop on first error
```

Use for critical changes where partial application is unacceptable.

### 3. Concurrency Limits

```yaml
strategy:
  concurrency: 6  # Max 6 repos at once
```

Prevents overwhelming GitHub API or creating too many PRs simultaneously.

### 4. Rate Limiting

Automatic rate limit detection and retry:
- Watches `X-RateLimit-Remaining` header
- Exponential backoff on 429 errors
- Up to 3 retries for primary rate limit

### 5. Repository Selectors

Use specific selectors to limit blast radius:

```yaml
selector:
  query: "org:camaraproject archived:false topic:sandbox"
  exclude:
    - "camaraproject/Governance"
    - "camaraproject/ReleaseManagement"
```

### 6. File-Based Filtering

Only process repositories with specific files:

```yaml
selector:
  has_files: [".github/workflows/specific.yml"]
```

Prevents operations on repositories that don't have the target files.

## Permissions Matrix

| Mode | contents | pull-requests | issues | Risk |
|------|----------|---------------|--------|------|
| PR mode | write | write | read | Low |
| PR + Issues | write | write | write | Low |
| Direct mode | write | - | - | High |

## Best Practices

### 1. Start Small

```yaml
selector:
  include:
    - "camaraproject/Template_API_Repository"  # Test repo
```

Test with 1-2 repositories before expanding to all.

### 2. Use Plan Mode

Always run in plan mode first:

```bash
gh workflow run bulk-run.yaml -f playbook=... -f plan_only=true
```

Review artifacts before applying.

### 3. Coordinate Timing

- Avoid bulk operations during release windows
- Coordinate with working group meetings
- Announce in Slack/email before major changes

### 4. Document Intent

Use clear PR titles and body templates:

```yaml
pr:
  title: "[bulk] Update actions/setup-node to v4"
  bodyTemplate: |
    ## Purpose
    Update GitHub Actions to latest stable version.

    ## Testing
    - [ ] CI passes in template repository
    - [ ] No breaking changes identified

    Approved by: Release Management WG
```

### 5. Monitor Results

After apply:
- Check `plan.md` for failures
- Review created PRs
- Monitor CI/CD runs
- Respond to review comments promptly

### 6. Emergency Rollback

If bulk change causes issues:

1. Close all open bulk PRs
2. Revert merged PRs in affected repos
3. Document incident
4. Update playbook to prevent recurrence

## Security Considerations

### Token Security

- Store `CAMARA_BULK_CHANGE_TOKEN` as encrypted secret
- Use environment protection for additional security
- Rotate tokens periodically
- Never log tokens

### Blast Radius Limitation

- Use specific selectors
- Start with small batches
- Exclude critical repositories
- Enable fail-fast for risky changes

### Code Review

- Always require reviewers for PR mode
- Use CODEOWNERS for automatic review assignment
- Enable branch protection rules

## Incident Response

If problems occur:

1. **Stop**: Cancel running workflows
2. **Assess**: Check `plan.md` and workflow logs
3. **Communicate**: Notify affected teams
4. **Fix**: Close/revert problematic PRs
5. **Document**: Record what happened
6. **Prevent**: Update playbook or workflow

## Compliance

### CAMARA Governance

All bulk operations must comply with:
- [CAMARA Governance](https://github.com/camaraproject/Governance)
- TSC approval for org-wide changes
- Working group consensus for subproject changes

### Audit Requirements

Maintain records of:
- Playbook files (in git)
- Workflow runs (GitHub Actions logs)
- Artifacts (results.csv, plan.md)
- Approvals (via GitHub environment or manual)

## Questions?

- **Issues**: GitHub Issues on project-administration
- **Discussion**: Release Management working group
- **Contact**: CAMARA admin team <adm@lists.camaraproject.org>
