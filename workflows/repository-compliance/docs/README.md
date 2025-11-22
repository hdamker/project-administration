# Repository Compliance Workflow - User Guide

Comprehensive guide for using and maintaining the repository compliance workflow.

## Table of Contents

1. [How Compliance Checks Work](#how-compliance-checks-work)
2. [Repository Categories](#repository-categories)
3. [Severity Levels and Enforcement](#severity-levels-and-enforcement)
4. [Configuration Management](#configuration-management)
5. [Understanding Reports](#understanding-reports)
6. [Troubleshooting](#troubleshooting)

## How Compliance Checks Work

The compliance workflow uses a two-source architecture:

1. **Repository Registry** ([config/repository-registry.yaml](../config/repository-registry.yaml))
   - Manual source of truth
   - Defines WHAT compliance expectations SHOULD be
   - Maintained by project administrators
   - Changes require PR approval

2. **Repository State** (auto-generated snapshot)
   - Current GitHub state
   - Captures WHAT repositories currently ARE
   - Generated via GitHub API
   - Refreshed on each workflow run

3. **Compliance Checks** ([config/compliance-checks.yaml](../config/compliance-checks.yaml))
   - Machine-readable check definitions
   - Compares state against registry expectations
   - Produces violation reports

## Repository Categories

### API Repository Categories

**api-graduated**
- Production-ready APIs
- Highest compliance requirements
- Required: 3+ maintainers, branch protection, all governance files
- Topic required: `graduated-api-repository`

**api-incubating**
- APIs under development toward graduation
- Moderate compliance requirements
- Required: 2+ maintainers, branch protection, core governance files
- Topic required: `incubating-api-repository`

**api-sandbox**
- Experimental APIs
- Basic compliance requirements
- Required: 1+ maintainer, basic governance files
- Topic required: `sandbox-api-repository`

### Other Categories

**working-group**
- Working group coordination repositories
- Topic required: `working-group`
- Required: 2+ maintainers, core governance files

**project-infrastructure**
- Project tooling and administration repositories
- Required: 2+ maintainers, branch protection
- Examples: project-administration, tooling repositories

**marketing**
- Marketing and branding repositories
- Relaxed compliance requirements
- License exceptions may apply

**archived**
- Archived repositories
- Different compliance rules
- Compliance checks may be exempted

**out-of-scope**
- Repositories not yet categorized
- Requires manual review and categorization
- Temporary category for new repositories

## Severity Levels and Enforcement

### Severity Levels

**critical**
- Fundamental project requirements
- Examples: Apache 2.0 license, security policies
- Immediate attention required

**high**
- Important governance requirements
- Examples: CODEOWNERS, maintainer counts, README
- Should be addressed promptly

**medium**
- Recommended practices
- Examples: CHANGELOG, governance documentation
- Should be addressed in reasonable timeframe

**low**
- Informational or minor issues
- Examples: Stale issues/PRs
- Awareness and tracking

### Enforcement Actions

**fail**
- Workflow fails if check violated
- Used for critical requirements
- Blocks workflow completion

**warn**
- Workflow continues but warns
- Used for high/medium requirements
- Appears in reports

**log**
- Logged for awareness
- Used for low severity items
- Informational only

## Configuration Management

### Adding a New Repository

1. Run discovery script:
   ```bash
   node scripts/generate-registry-template.js
   ```

2. Review generated [config/repository-registry.yaml](../config/repository-registry.yaml)

3. Manually categorize any `out-of-scope` repositories

4. Create PR with registry changes

### Changing Repository Category

1. Edit [config/repository-registry.yaml](../config/repository-registry.yaml)

2. Update `category` field

3. Adjust optional fields if needed:
   - `required_maintainers`
   - `branch_protection_required`

4. Create PR with changes

### Adding Check Exceptions

To exempt a repository from specific checks:

1. Edit repository entry in [config/repository-registry.yaml](../config/repository-registry.yaml)

2. Add `exceptions` list with check IDs:
   ```yaml
   - name: MyRepository
     category: api-incubating
     exceptions:
       - license-apache-2  # Exempt from license check
       - branch-protection-main
     notes: "Exception approved for [reason]"
   ```

3. Add `notes` explaining the exception

4. Create PR with justification

### Modifying Compliance Checks

1. Edit [config/compliance-checks.yaml](../config/compliance-checks.yaml)

2. Modify check definition (severity, enforcement, parameters)

3. Validate configuration:
   ```bash
   node scripts/validate-compliance-checks.js
   ```

4. Create PR with changes

## Understanding Reports

### Compliance Report Structure

**Repository Summary:**
- Repository name and category
- Overall compliance status
- Violation count by severity

**Violations:**
- Check ID and name
- Severity level
- Description of violation
- Remediation guidance

**Drift Detection:**
- Changes in repository state since last run
- New repositories discovered
- Category changes

## Troubleshooting

### Repository Not in Registry

**Symptom:** Repository exists in GitHub but not in compliance reports

**Solution:**
1. Run `node scripts/generate-registry-template.js`
2. Check if repository appears in generated registry
3. If not, verify repository is in camaraproject organization
4. Check repository visibility (private repos may not be discoverable)

### False Positive Violations

**Symptom:** Check reports violation but requirement is met

**Possible Causes:**
1. File in non-standard location (check parameters in compliance-checks.yaml)
2. File format not recognized (check case sensitivity)
3. State snapshot is stale (re-run state generation)

**Solution:**
1. Review check parameters in [config/compliance-checks.yaml](../config/compliance-checks.yaml)
2. Verify file locations match expected paths
3. Regenerate repository state snapshot

### Check Should Not Apply to Repository

**Symptom:** Repository receives violations for checks that shouldn't apply

**Solution:**
Add check exception in [config/repository-registry.yaml](../config/repository-registry.yaml):
```yaml
exceptions:
  - check-id-to-exempt
notes: "Justification for exception"
```

### Registry Validation Fails

**Symptom:** `validate-registry.js` reports errors

**Common Issues:**
1. Duplicate repository names
2. Invalid category value
3. Exception references non-existent check ID
4. Invalid YAML syntax

**Solution:**
1. Review error message for specific issue
2. Fix registry file
3. Re-run validation

## Best Practices

### Regular Reviews

- Review compliance reports weekly
- Address critical and high severity violations promptly
- Track medium/low violations for periodic cleanup

### Exception Management

- Document all exceptions with justifications
- Review exceptions quarterly
- Remove exceptions when no longer needed

### Category Management

- Review out-of-scope repositories monthly
- Categorize new repositories promptly
- Update categories when repository status changes (sandbox → incubating → graduated)

## Architecture

See [architecture/README.md](architecture/README.md) for design decisions and technical architecture documentation.
