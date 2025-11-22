# Repository Compliance Scripts

This directory contains the compliance checking pipeline scripts.

## Script Execution Order

1. **generate-registry-template.js** - Auto-discover and categorize CAMARA repositories
2. **validate-compliance-checks.js** - Validate compliance-checks.yaml configuration
3. **validate-registry.js** - Validate repository-registry.yaml configuration
4. **generate-state.js** - Generate repository state snapshot from GitHub API
5. **validate-compliance.js** - Run compliance checks against repository state
6. **generate-reports.js** - Generate compliance reports

## Scripts

### generate-registry-template.js

Auto-discovers all CAMARA repositories and generates an initial repository-registry.yaml template.

**Usage:**
```bash
node scripts/generate-registry-template.js [--output config/repository-registry.yaml]
```

**Categorization logic:**
- `graduated-api-repository` topic → api-graduated
- `incubating-api-repository` topic → api-incubating
- `sandbox-api-repository` topic → api-sandbox
- `working-group` topic → working-group
- Archived repos → archived
- Infrastructure naming patterns → project-infrastructure
- Marketing naming patterns → marketing
- Others → out-of-scope (requires manual review)

**Output:**
- config/repository-registry.yaml with all discovered repositories
- Statistics on category breakdown
- Warnings for repositories requiring manual categorization

### validate-compliance-checks.js

Validates compliance-checks.yaml against its schema and performs additional checks.

**Usage:**
```bash
node scripts/validate-compliance-checks.js
```

**Validations:**
- Schema compliance
- Unique check IDs
- Valid applies_to categories
- Phase 1 check identification (implemented: true)

### validate-registry.js

Validates repository-registry.yaml against its schema and performs additional checks.

**Usage:**
```bash
node scripts/validate-registry.js
```

**Validations:**
- Schema compliance
- Unique repository names
- Valid category assignments
- Valid exception references (check IDs exist)

### generate-state.js

Generates repository-state.yaml by querying GitHub API for all registered repositories.

**Usage:**
```bash
node scripts/generate-state.js [--output ../data/repository-state.yaml]
```

**Data collected:**
- Repository topics, description, license
- Activity dates (last commit, last activity)
- Open issues/PRs counts
- Branch protection status
- File presence (README, LICENSE, CODEOWNERS, etc.)
- Directory structure (API repositories)

**Output:**
- ../data/repository-state.yaml (snapshot)
- Change summary if compared with existing state

### validate-compliance.js (Phase 1)

Runs Phase 1 compliance checks against repository state.

**Checks implemented:**
- topic-alignment
- license-apache-2
- codeowners-present
- maintainers-minimum
- readme-present
- api-directory-structure

**Usage:**
```bash
node scripts/validate-compliance.js [--state ../data/repository-state.yaml]
```

### generate-reports.js (Phase 2)

Generates compliance reports from validation results.

**Usage:**
```bash
node scripts/generate-reports.js
```

## Dependencies

All scripts require:
- Node.js 16+
- npm packages: `js-yaml`, `@octokit/rest`
- Environment variable: `GITHUB_TOKEN` (for GitHub API access)

## Installation

```bash
npm install js-yaml @octokit/rest
```

## Environment Variables

- `GITHUB_TOKEN` - GitHub personal access token with repo read access
- `GITHUB_ORG` - GitHub organization (default: camaraproject)
