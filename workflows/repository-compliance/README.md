# Repository Compliance Workflow

Automated compliance checking for CAMARA repositories.

## Overview

The Repository Compliance workflow validates CAMARA repositories against compliance requirements defined in [compliance-checks.yaml](config/compliance-checks.yaml). It uses a hybrid registry approach:

- **[repository-registry.yaml](config/repository-registry.yaml)** - Manual registry (source of truth) defining what compliance expectations SHOULD be
- **repository-state.yaml** (auto-generated) - Current repository state snapshot from GitHub API showing what IS
- **Compliance reports** - Comparison identifying violations and drift

## Quick Start

### 1. Validate Configuration

```bash
cd workflows/repository-compliance

# Validate compliance check definitions
node scripts/validate-compliance-checks.js

# Validate repository registry
node scripts/validate-registry.js
```

### 2. Generate Repository State

```bash
# Generate current state snapshot from GitHub API
node scripts/generate-state.js --output ../data/repository-state.yaml
```

### 3. Run Compliance Checks

```bash
# Run Phase 1 compliance checks
node scripts/validate-compliance.js --state ../data/repository-state.yaml
```

## Configuration Files

### [config/compliance-checks.yaml](config/compliance-checks.yaml)

Machine-readable specification of all compliance checks organized into 5 categories:

1. **Repository Configuration** - Topics, description, license, branch protection
2. **Governance Files** - CODEOWNERS, MAINTAINERS, GOVERNANCE.md, LICENSE
3. **Documentation Structure** - README, CHANGELOG, directory structure
4. **Process Templates** - Issue templates, PR template, CI workflows
5. **Activity & Health** - Inactivity detection, stale issues/PRs

Each check specifies:
- `id`: Unique identifier
- `category`: High-level category
- `applies_to`: Repository categories this check applies to
- `severity`: critical, high, medium, low
- `enforcement`: fail, warn, log
- `implemented`: Phase 1 (true) or Phase 2+ (false)
- `parameters`: Check-specific configuration

### [config/repository-registry.yaml](config/repository-registry.yaml)

Manual registry of all CAMARA repositories serving as source of truth for compliance expectations.

**Repository Categories:**
- `api-graduated` - Graduated API repositories
- `api-incubating` - Incubating API repositories
- `api-sandbox` - Sandbox API repositories
- `working-group` - Working group repositories
- `project-infrastructure` - Project infrastructure repositories
- `marketing` - Marketing and branding repositories
- `archived` - Archived repositories
- `out-of-scope` - Repositories not yet categorized (requires manual review)

**Fields:**
- `name`: Repository name (required, unique)
- `category`: Repository category (required)
- `sub_project`: Optional sub-project classification
- `required_maintainers`: Override category default
- `branch_protection_required`: Override category default
- `exceptions`: List of check IDs to exempt
- `notes`: Optional notes

### repository-state.yaml (Auto-generated)

Current state snapshot generated from GitHub API. Stored in `../data/repository-state.yaml`.

**Contains:**
- Repository topics, description, license
- Activity dates, open issues/PRs counts
- File presence checks (README, LICENSE, CODEOWNERS, etc.)
- Directory structure (API repositories)
- Branch protection status

## Workflow Modes

### Dry-Run Mode

Test mode that generates state and reports without creating PRs:
- Runs all compliance checks
- Uploads state.yaml and reports to artifacts
- Does not create PRs or modify repository

### Update Mode

Production mode that creates PRs for detected changes:
- Generates repository-state.yaml
- Compares with existing state
- Creates PR if changes detected
- Uploads compliance reports to artifacts

## Phased Implementation

### Phase 1 (Current)

Core governance checks (implemented: true):
- topic-alignment
- license-apache-2
- codeowners-present
- maintainers-minimum
- readme-present
- api-directory-structure

### Phase 2 (Planned)

Enhanced reporting:
- Health scores (0-100)
- Drift detection
- Severity-based violation categorization
- Multiple export formats

### Phase 3 (Planned)

Activity metrics:
- Trend analysis
- Maintainer responsiveness
- Contributor diversity

## Documentation

- [schemas/README.md](schemas/README.md) - Schema validation approach
- [scripts/README.md](scripts/README.md) - Script documentation
- [docs/README.md](docs/README.md) - User guide
- [docs/architecture/](docs/architecture/) - Architecture decisions

## Related Issues

- [#51](https://github.com/camaraproject/project-administration/issues/51) - Define Compliance Check Categories and Requirements
- [#50](https://github.com/camaraproject/project-administration/issues/50) - Update Repository Compliance Overview Workflow

## Validation

All configuration files have corresponding schemas in [schemas/](schemas/):
- compliance-checks-schema.yaml
- repository-registry-schema.yaml
- repository-state-schema.yaml
