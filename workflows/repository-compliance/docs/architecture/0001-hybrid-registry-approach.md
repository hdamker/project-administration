# ADR 0001: Hybrid Registry Approach

**Status:** Accepted
**Date:** 2025-11-22
**Deciders:** CAMARA Project Administration Team

## Context

The repository compliance workflow needs to track compliance expectations for all CAMARA repositories. We need to determine how to manage this information:

1. **Auto-discovery only**: Query GitHub API on every run to discover and categorize repositories
2. **Manual registry only**: Maintain a manually-curated list of all repositories
3. **Hybrid approach**: Combine manual registry with auto-generated state snapshots

### Requirements

- Track compliance expectations for 80+ repositories across multiple categories
- Detect new repositories as they are created
- Support repository lifecycle changes (sandbox → incubating → graduated, archiving)
- Enable exception management (repository-specific exemptions from checks)
- Provide audit trail of compliance expectation changes
- Allow non-administrators to propose registry changes via PRs

### Challenges

- Auto-discovery cannot reliably determine correct categorization (topics may be missing or incorrect)
- Manual registry becomes stale if not updated when repositories are created/changed
- Pure auto-discovery cannot support exceptions or overrides
- Manual maintenance of 80+ repositories is error-prone

## Decision

Implement a **hybrid registry approach** with two separate files:

### 1. repository-registry.yaml (Manual, Source of Truth)

A manually-maintained YAML file defining compliance expectations:

```yaml
repositories:
  - name: QualityOnDemand
    category: api-graduated
    sub_project: connectivity-quality-management
    required_maintainers: 3
    branch_protection_required: true
```

**Characteristics:**
- Explicitly defines WHAT compliance expectations SHOULD be
- Version-controlled in Git
- Changes require PR approval
- Supports exceptions and overrides
- Community-accessible (non-admins can create PRs)

### 2. repository-state.yaml (Auto-Generated Snapshot)

An auto-generated YAML file capturing current GitHub state:

```yaml
repositories:
  - name: QualityOnDemand
    state:
      topics: [graduated-api-repository, qod]
      license: Apache-2.0
      last_activity: 2025-11-15
      maintainers_count: 5
```

**Characteristics:**
- Captures WHAT repositories currently ARE
- Generated from GitHub API on each workflow run
- Not manually edited
- Stored for drift detection
- Updated automatically

### Workflow

1. **Discovery**: Run `generate-registry-template.js` to discover all repositories and create initial registry template
2. **Manual Review**: Administrator reviews and categorizes repositories (especially out-of-scope items)
3. **State Generation**: Workflow queries GitHub API for all registered repositories
4. **Compliance Checking**: Compare state against registry expectations using compliance-checks.yaml
5. **Drift Detection**: Identify discrepancies between registry (SHOULD) and state (IS)

## Consequences

### Positive

- **Clear Source of Truth**: Registry explicitly defines compliance expectations
- **Independent Updates**: Registry and state can be updated independently
  - State updates don't require re-categorization
  - Registry updates don't require GitHub API calls
- **Exception Support**: Registry can define repository-specific exceptions
- **Audit Trail**: Git history tracks all registry changes with PR justifications
- **Community Participation**: Non-admins can propose registry changes via PRs
- **Drift Detection**: Comparing registry vs state reveals configuration drift
- **Scalability**: Adding repositories requires only registry PR (no code changes)

### Negative

- **Two Sources**: Must maintain consistency between registry and actual repositories
- **Manual Effort**: New repositories must be added to registry (though auto-discovery helps)
- **Staleness Risk**: Registry may become stale if not updated
- **Learning Curve**: Users must understand distinction between registry and state

### Mitigation Strategies

**Staleness Prevention:**
- Auto-discovery script generates complete registry template
- Workflow can detect repositories not in registry
- Regular reviews of out-of-scope repositories

**Consistency Maintenance:**
- Validation scripts check registry structure
- State generation fails if registry references non-existent repositories
- Drift reports highlight discrepancies

## Alternatives Considered

### Alternative 1: Pure Auto-Discovery

**Description:** Query GitHub API on every run, auto-categorize based on topics

**Rejected Because:**
- Cannot reliably auto-categorize (topics may be missing or incorrect)
- No support for exceptions or overrides
- No audit trail of categorization decisions
- Cannot define expected state (only observe current state)

### Alternative 2: Database-Backed Registry

**Description:** Store registry in database instead of YAML file

**Rejected Because:**
- Adds infrastructure complexity
- Loses Git-based version control and audit trail
- Reduces accessibility (requires database access instead of PR)
- YAML file is sufficient for current scale (80+ repositories)

### Alternative 3: Embedded in Repositories

**Description:** Each repository defines its own compliance expectations in a local file

**Rejected Because:**
- No central view of all repositories
- Difficult to enforce consistency
- Cannot manage compliance for repositories without such files
- Requires changes to 80+ repositories

## Related Decisions

- ADR 0002: Configuration-Driven Compliance Checks

## References

- Issue #51: Define Compliance Check Categories and Requirements
- Issue #50: Update Repository Compliance Overview Workflow
