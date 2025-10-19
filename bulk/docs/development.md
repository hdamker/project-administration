# Development Guide

Guide for developing and testing the CAMARA Bulk Orchestrator locally.

## Prerequisites

- **Node.js**: 20.x or higher
- **Python**: 3.11 or higher (for Python operations)
- **Git**: Latest version
- **GitHub CLI** (optional): For testing workflows

## Quick Start

```bash
cd bulk/action
npm install
npm run build
```

## Project Structure

```
bulk/
├── action/                 # TypeScript GitHub Action
│   ├── src/               # Source code
│   │   ├── index.ts       # Main orchestrator
│   │   ├── github/        # GitHub API clients
│   │   ├── ops/           # Built-in operations
│   │   ├── runners/       # Operation runners (Python, etc.)
│   │   ├── sdk/           # Context and utilities
│   │   └── schemas/       # JSON Schema validation
│   ├── dist/              # Compiled JavaScript (committed)
│   ├── package.json
│   └── tsconfig.json
├── playbooks/             # YAML playbook configurations
├── ops-local/             # Python operations
├── templates/             # PR/Issue body templates
└── docs/                  # Documentation
```

## Development Workflow

### 1. Make Changes

Edit files in `bulk/action/src/`

### 2. Rebuild

```bash
cd bulk/action
npm run build
```

### 3. Test via Workflow

```bash
gh workflow run bulk-run.yaml \
  -f playbook=bulk/playbooks/test-safe.yaml \
  -f plan_only=true
```

## Building for Production

```bash
cd bulk/action
npm install
npm run build

# Commit dist/
git add dist/
git commit -m "Build TypeScript action"
```

**Why commit dist/?** GitHub Actions cannot run TypeScript directly.

## Secrets Setup

Add `CAMARA_BULK_CHANGE_TOKEN` with permissions:
- `contents: write`
- `pull-requests: write`
- `issues: write`

## Testing with Personal Forks

Before testing on production CAMARA repositories, validate the orchestrator on your personal forks using a Fine-Grained Personal Access Token (FGPAT) with minimal permissions.

### Creating a Fine-Grained Personal Access Token

**Step 1: Generate Token**
1. Go to https://github.com/settings/tokens?type=beta
2. Click "Generate new token" (Fine-grained)
3. Configure:
   - **Token name**: `CAMARA Bulk Test (hdamker)`
   - **Expiration**: 7 days (recommended for testing)
   - **Resource owner**: Your account (e.g., `hdamker`)

**Step 2: Repository Access**
- **Repository access**: "Only select repositories"
- Select your test repositories:
  - `hdamker/QualityOnDemand`
  - `hdamker/QoSBooking`
  - (Optionally) `hdamker/project-administration`

**Step 3: Permissions**

Minimal permissions required:

| Permission | Access | Purpose |
|------------|--------|---------|
| **Contents** | Read and write | Clone, read files, create branches, commit changes |
| **Pull requests** | Read and write | Create and update PRs |
| **Issues** | Read and write | (Optional) Only if testing issue creation |

**NOT required for testing:**
- ❌ Workflows
- ❌ Administration
- ❌ Actions (Metadata is auto-granted read-only)

**Step 4: Add Secret**
1. Go to your repository Settings → Secrets and variables → Actions
2. Create new secret:
   - **Name**: `CAMARA_BULK_CHANGE_TOKEN`
   - **Value**: Paste your FGPAT
3. Save

### Token Scope Comparison

| Aspect | Testing (hdamker) | Production (camaraproject) |
|--------|-------------------|---------------------------|
| **Owner** | Personal account | Organization account |
| **Scope** | Selected repos (2-3) | All CAMARA repos (or selected) |
| **Permissions** | Contents + PRs | Contents + PRs + (possibly Workflows) |
| **Risk** | ✅ Low - your repos only | ⚠️ High - affects upstream |
| **Approval** | ✅ Self-service | ❌ Requires org admin approval |
| **Expiration** | Short (7 days) | Longer (30-90 days) |
| **Revocation** | Easy, no impact | Requires coordination |

### Test Playbook for Personal Forks

Use the provided test playbook:

```bash
gh workflow run bulk-run.yaml \
  -f playbook=bulk/playbooks/test-hdamker.yaml \
  -f plan_only=true
```

This playbook:
- Targets only `hdamker/QualityOnDemand` and `hdamker/QoSBooking`
- Performs safe no-op file replacement
- Runs in plan mode by default
- Creates test PRs with `test` and `automation` labels

**Validation steps:**
1. Run in plan mode (`plan_only=true`) first
2. Check `plan.md` artifact for expected changes
3. Run in apply mode (`plan_only=false`) to create test PRs
4. Review PRs in your fork repositories
5. Close/merge test PRs manually

Once validated on your forks, you can transition to production with an organization-level token.

## Testing Python Operations

```bash
cat > /tmp/test-input.json <<'EOF'
{
  "repo": {"owner": "test", "name": "repo", "fullName": "test/repo", "defaultBranch": "main"},
  "inputs": {"paths": ["*.yaml"]},
  "mode": "plan"
}
EOF

python bulk/ops-local/python/collect_yaml_has_wip.py < /tmp/test-input.json | jq .
```

## Adding New Operations

### TypeScript Operation

1. Create `bulk/action/src/ops/my-operation.ts`
2. Register in `bulk/action/src/index.ts` TS_OPS
3. Rebuild and test

### Python Operation

1. Create `bulk/ops-local/python/my_operation.py`
2. Use in playbook: `use: "bulk/ops-local/python/my_operation.py"`

## Debugging

### Enable Debug Logging

```yaml
env:
  ACTIONS_STEP_DEBUG: true
```

### Check Artifacts

```bash
gh run download <run-id>
cat results.csv plan.md
jq . results.jsonl
```

### Common Issues

**Cannot find dist/index.js**: Run `npm run build`

**GITHUB_TOKEN not provided**: Set in workflow env

**Schema validation fails**: Validate against schema:
```bash
ajv validate -s bulk/action/src/schemas/playbook.schema.json -d playbook.yaml
```

## Testing Checklist

- [ ] TypeScript compiles (`npm run build`)
- [ ] Schema validates playbooks
- [ ] Python ops tested standalone
- [ ] Test playbook runs in plan mode
- [ ] Documentation updated
- [ ] Dist/ committed

## Code Style

- TypeScript: strict mode, async/await
- Python: PEP 8, JSON stdin/stdout contract
- YAML: 2-space indentation

## Support

- **Issues**: GitHub Issues on project-administration
- **Discussion**: Release Management working group
- **Examples**: See [cookbook.md](cookbook.md)
