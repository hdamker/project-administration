# ADR-0001: Feature-Grouped Organization

**Status**: Accepted

**Date**: 2025-10-30

---

## Context

The meta-release collector workflow v3 was initially organized with a flat directory structure at the repository root level:

```
# Original structure (flat)
config/
schemas/
scripts/
documentation/
data/
reports/
viewers/
```

This created several challenges:

1. **Unclear scope**: Hard to determine which files belonged to the workflow vs general repository infrastructure
2. **Inconsistent patterns**: The repository already had a feature-grouped pattern for campaigns (`campaigns/release-info/`) but workflow v3 used a different approach
3. **Future scalability**: Adding more workflows would continue cluttering the root directory
4. **Maintenance complexity**: No clear boundary for workflow-specific configuration, schemas, and documentation
5. **Discovery difficulty**: New developers couldn't easily identify all components of a single workflow

Meanwhile, the bulk campaigns implementation demonstrated a successful pattern with `campaigns/{campaign-name}/docs/` and `campaigns/{campaign-name}/templates/`, keeping campaign-specific files grouped together while shared resources (like `data/releases-master.yaml`) remained at the root.

---

## Decision

Reorganize the meta-release collector workflow to use a **feature-grouped directory structure** that mirrors the campaigns pattern:

```
workflows/meta-release-collector/
├── config/              # Workflow-specific configuration
├── schemas/             # Data schemas for this workflow
├── scripts/             # Node.js pipeline scripts
├── docs/                # Workflow documentation
└── templates/           # Viewer templates (Phase 2)

# Shared at repository root
data/                    # Shared data source (releases-master.yaml)
reports/                 # Generated reports (output)
viewers/                 # Generated viewers (output)
```

**Key principles**:

1. **Group by feature**: All files belonging to a workflow are organized under `workflows/{workflow-name}/`
2. **Shared resources at root**: Data, output directories, and truly shared components remain at root level
3. **Consistency**: Match the organizational pattern already established by campaigns
4. **Self-contained**: Each workflow directory contains everything needed to understand and modify that workflow
5. **Root-relative paths**: Scripts use repository root as reference point for shared resources

**Implementation approach**:

- Use `git mv` to preserve history
- Update workflow file to reference new script paths
- Scripts use `REPO_ROOT = path.join(__dirname, '..', '..', '..')` pattern for root-level resources
- Scripts use relative paths (`../config`) for workflow-level resources

---

## Consequences

### Positive

**Clarity and maintainability**:
- Clear scope: Everything in `workflows/meta-release-collector/` belongs to that workflow
- Easy navigation: All workflow components in one place
- Self-documenting: Directory structure reveals organization
- Future-proof: Easy to add `workflows/another-workflow/` without root-level clutter

**Consistency**:
- Matches campaigns pattern (`campaigns/release-info/`)
- Developers familiar with campaigns understand this structure immediately
- Reduces cognitive load when switching between campaigns and workflows

**Modularity**:
- Workflow can be versioned, tested, and documented as a unit
- Clear boundaries between workflow-specific and shared concerns
- Configuration, schemas, and documentation travel together

### Negative

**Path complexity**:
- Scripts now need to navigate up three levels (`../../..`) to reach repository root
- More complex relative paths in workflow file (`workflows/meta-release-collector/scripts/detect-releases.js`)
- Mitigation: Use `REPO_ROOT` constant and clear path comments in code

**Migration effort**:
- One-time cost to reorganize files
- Need to update all path references in workflow and scripts
- Need to update planning documentation
- Mitigation: Git tracks renames automatically, changes are mechanical

### Trade-offs Accepted

We accept slightly more complex paths in exchange for:
- Clear organizational structure
- Consistency with established patterns
- Better long-term maintainability
- Easier onboarding for new developers

---

## Alternatives Considered

### Alternative 1: Keep Flat Structure

**Pros**:
- Shorter paths in workflow file
- No migration needed
- Simpler relative paths in scripts

**Cons**:
- Continues inconsistency with campaigns pattern
- Root directory remains cluttered
- Unclear scope for workflow files
- Harder to add more workflows in future

**Verdict**: Rejected - short-term simplicity doesn't outweigh long-term maintainability

### Alternative 2: Move Everything Including Shared Resources

**Approach**:
```
workflows/meta-release-collector/
├── config/
├── schemas/
├── scripts/
├── docs/
├── data/              # Move here
├── reports/           # Move here
└── viewers/           # Move here
```

**Pros**:
- Truly self-contained
- All resources in one place
- Simpler relative paths

**Cons**:
- `data/releases-master.yaml` is used by BOTH campaigns and workflow v3
- Moving shared data breaks campaigns
- Output directories (`reports/`, `viewers/`) are conceptually repository-level artifacts

**Verdict**: Rejected - violates principle of shared resources at root

### Alternative 3: Use Symlinks

**Approach**: Keep files at root, create `workflows/meta-release-collector/` as symlink directory

**Pros**:
- Appears grouped without moving files
- No path updates needed

**Cons**:
- Symlinks complicate Git history
- Confusing directory structure (which is canonical?)
- Doesn't actually solve organization problem
- Cross-platform symlink issues

**Verdict**: Rejected - adds complexity without solving underlying issue

---

## Related Decisions

- **Scripts vs Actions**: Workflow v3 continues using script-based approach rather than GitHub Actions, as it's optimized for data pipelines rather than bulk PR operations
- **Campaigns ADR-0001** (`campaigns/release-info/docs/ADR/0001-campaign-architecture.md`): Established the pattern of grouping campaign-specific files

---

## Implementation Notes

### Files Moved

- `config/` → `workflows/release-collector/config/`
- `schemas/` → `workflows/release-collector/schemas/`
- `scripts/` → `workflows/release-collector/scripts/`
- `documentation/` → `workflows/release-collector/docs/`
- Created: `workflows/release-collector/templates/` (for Phase 2)

### Files Updated

- `.github/workflows/release-collector.yml` - All script paths
- `workflows/release-collector/scripts/*.js` - Path references using REPO_ROOT pattern
- Documentation updated to reflect new structure

### Kept at Root

- `data/releases-master.yaml` - Shared data source
- `reports/` - Generated output
- `viewers/` - Generated output
