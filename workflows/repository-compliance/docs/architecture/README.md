# Architecture Documentation

This directory contains Architecture Decision Records (ADRs) documenting significant design decisions for the repository compliance workflow.

## ADR Index

| Number | Title | Status | Date |
|--------|-------|--------|------|
| [0001](0001-hybrid-registry-approach.md) | Hybrid Registry Approach | Accepted | 2025-11-22 |
| [0002](0002-configuration-driven-checks.md) | Configuration-Driven Compliance Checks | Accepted | 2025-11-22 |

## Design Principles

### 1. Separation of Concerns

The workflow separates three distinct concerns:
- **Policy Definition** (registry): What compliance expectations SHOULD be
- **State Collection** (state snapshot): What repository state currently IS
- **Validation Logic** (compliance checks): How to compare and evaluate

### 2. Configuration Over Code

Compliance requirements are defined in machine-readable YAML configuration rather than hard-coded in scripts. This enables:
- Non-developers to understand and modify requirements
- Version control of compliance policy changes
- Community review of requirement changes via PRs

### 3. Phased Implementation

The workflow implements features in phases to balance completeness with time-to-value:
- **Phase 1**: Core governance checks
- **Phase 2**: Enhanced reporting and drift detection
- **Phase 3**: Activity metrics and trend analysis

### 4. Explicit Over Implicit

All repository categorizations and compliance expectations are explicitly defined in the registry rather than inferred from repository state. This:
- Creates a clear source of truth
- Enables detection of drift
- Supports exception management

## Related Documentation

- [User Guide](../README.md) - How to use the compliance workflow
- [Root README](../../README.md) - Quick start and overview
- [Schemas](../../schemas/README.md) - Configuration validation
- [Scripts](../../scripts/README.md) - Pipeline scripts

## Contributing ADRs

When making significant architectural changes:

1. Create new ADR file: `NNNN-descriptive-title.md`
2. Follow existing ADR format (Context, Decision, Consequences, Alternatives)
3. Reference related ADRs
4. Update this README index
5. Create PR for review
