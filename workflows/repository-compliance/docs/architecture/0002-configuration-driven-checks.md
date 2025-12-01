# ADR 0002: Configuration-Driven Compliance Checks

**Status:** Accepted
**Date:** 2025-11-22
**Deciders:** CAMARA Project Administration Team

## Context

The repository compliance workflow needs to validate repositories against various compliance requirements. We need to determine how to define and manage these validation rules.

### Requirements

- Define compliance checks for 5 categories: Repository Configuration, Governance Files, Documentation Structure, Process Templates, Activity & Health
- Support different requirements for different repository categories (API repositories vs working groups)
- Enable non-developers to understand and propose requirement changes
- Track which checks are implemented vs planned
- Support phased implementation (Phase 1 → Phase 2 → Phase 3)
- Allow easy modification of check parameters (thresholds, file paths, etc.)
- Version control compliance requirements

### Challenges

- Hard-coded checks in scripts are difficult for non-developers to understand
- Changing check parameters requires code changes and testing
- No clear visibility into which checks are active vs planned
- Difficult to communicate compliance requirements to repository maintainers

## Decision

Implement **configuration-driven compliance checks** using a machine-readable YAML specification file: [compliance-checks.yaml](../../config/compliance-checks.yaml)

### Structure

```yaml
version: 1
metadata:
  description: Specification of repository compliance checks
  owner: camaraproject/project-administration
  repo_categories: [api-sandbox, api-incubating, ...]
  severities: [critical, high, medium, low]

checks:
  - id: license-apache-2
    name: "Apache 2.0 license configuration"
    description: "Validate Apache 2.0 license and LICENSE file presence"
    category: "Repository Configuration"
    applies_to: [api-sandbox, api-incubating, api-graduated]
    severity: critical
    enforcement: fail
    implemented: true
    parameters:
      expected_license_spdx: "Apache-2.0"
      license_file: "LICENSE"
```

### Key Fields

- **id**: Unique kebab-case identifier for programmatic reference
- **name**: Human-readable short name
- **description**: Detailed explanation of what the check validates
- **category**: High-level grouping (1 of 5 categories)
- **applies_to**: List of repository categories this check applies to
- **severity**: critical, high, medium, low (impact assessment)
- **enforcement**: fail (blocks workflow), warn (reports but continues), log (informational)
- **implemented**: true for Phase 1, false for Phase 2+
- **parameters**: Check-specific configuration (file paths, thresholds, etc.)
- **notes**: Optional context or rationale

### Phased Implementation

Checks marked `implemented: true` are Phase 1 (active now):
- topic-alignment
- license-apache-2
- codeowners-present
- maintainers-minimum
- readme-present
- api-directory-structure

Checks marked `implemented: false` are Phase 2+ (planned):
- All other checks

This enables:
- Clear communication of current vs planned requirements
- Gradual rollout of checks
- Visibility into roadmap

## Consequences

### Positive

- **Accessibility**: Non-developers can read and understand compliance requirements
- **Modifiability**: Changing parameters doesn't require code changes
- **Transparency**: All stakeholders can see exactly what is checked
- **Version Control**: Git tracks all requirement changes with justifications
- **Community Input**: Non-admins can propose requirement changes via PRs
- **Self-Documentation**: Configuration file serves as requirements documentation
- **Flexibility**: Easy to add new checks without code changes
- **Testability**: Configuration can be validated independently

### Negative

- **Validation Logic Separation**: Check implementation still requires code
- **Schema Maintenance**: Changes to check structure require schema updates
- **Parameter Flexibility Limits**: Highly dynamic checks may not fit configuration model

### Mitigation Strategies

**Complex Checks:**
- Use parameters for configurable aspects
- Implement complex logic in validation code, expose knobs as parameters

**Schema Evolution:**
- Version schema and configuration together
- Use `additionalProperties: true` for extensibility

## Implementation Approach

1. **Configuration Loading**: Scripts load compliance-checks.yaml at runtime
2. **Schema Validation**: Validate configuration against compliance-checks-schema.yaml
3. **Check Execution**: For each check where `implemented: true`:
   - Load repository state
   - Apply check logic using parameters
   - Report violations with severity and enforcement
4. **Exception Handling**: Cross-reference with repository registry exceptions
5. **Report Generation**: Produce compliance reports grouped by severity

## Alternatives Considered

### Alternative 1: Hard-Coded Checks

**Description:** Define all checks in JavaScript/Python code

**Rejected Because:**
- Requires developer knowledge to understand requirements
- Changes require code review and testing
- No separation between policy and implementation
- Difficult for community to propose requirement changes

### Alternative 2: Separate Check Files

**Description:** One file per check (check-license-apache-2.yaml, etc.)

**Rejected Because:**
- Fragments compliance requirements across many files
- Difficult to get overview of all checks
- More complex to maintain consistency
- Harder to understand relationships between checks

### Alternative 3: JSON Configuration

**Description:** Use JSON instead of YAML for configuration

**Rejected Because:**
- YAML is more human-readable (supports comments, multi-line strings)
- Other CAMARA workflows use YAML (Commonalities, releases)
- JSON lacks comment support for inline documentation

### Alternative 4: Database-Stored Checks

**Description:** Store checks in database with UI for editing

**Rejected Because:**
- Adds infrastructure complexity
- Loses Git-based version control
- Reduces transparency (no PR-based review)
- Overkill for current scale (~20 checks)

## Category-Specific Application

The `applies_to` field enables category-specific requirements:

**Example 1:** API directory structure only for API repositories
```yaml
applies_to: [api-sandbox, api-incubating, api-graduated]
```

**Example 2:** Higher maintainer requirements for graduated APIs
```yaml
parameters:
  min_count_by_category:
    api-graduated: 3
    api-incubating: 2
```

This supports differentiated compliance expectations while maintaining single source of truth.

## Related Decisions

- ADR 0001: Hybrid Registry Approach

## References

- Issue #51: Define Compliance Check Categories and Requirements
- compliance-checks.yaml: Check definitions
- compliance-checks-schema.yaml: Validation schema
