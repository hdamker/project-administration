# ADR-0002: Runtime Enrichment Architecture

**Status**: Accepted

**Date**: 2025-09-22 (Phase 1 implementation), 2025-10-31 (documented)

---

## Context

The meta-release collector needs to combine two distinct types of information:

1. **GitHub Facts**: Immutable metadata from GitHub repositories
   - Repository name, release tag, release date
   - API name, version, title (from OpenAPI spec)
   - Commonalities version
   - These are factual, verifiable, and change only when GitHub data changes

2. **Portfolio Metadata**: Organizational context that evolves independently
   - API categories (e.g., "Location and Tracking", "Session and QoS")
   - URLs to camaraproject.org API pages
   - Display names, tooltips, descriptions
   - Publication status, first release information
   - These change based on business decisions, website updates, categorization schemes

### The Problem

Early implementations mixed both types of data in the master metadata file (`releases-master.yaml`), creating several issues:

1. **Update complexity**: Changing a category required re-running the entire analysis pipeline
2. **Data coupling**: Portfolio decisions (like categorization) were tightly coupled with GitHub facts
3. **Maintenance burden**: Every portfolio update risked corrupting factual GitHub data
4. **Unclear ownership**: Hard to distinguish "what GitHub told us" from "what we decided"
5. **Validation difficulty**: Can't validate GitHub facts independently from portfolio metadata

### Alternative Approaches Considered

#### Option A: Embedded Enrichment (v1/v2 approach)
Store all metadata together in releases-master.yaml:
```yaml
- repository: DeviceLocation
  release_tag: r1.3
  apis:
    - api_name: device-location-verification
      version: 1.1.0
      category: "Location and Tracking"          # Portfolio metadata
      camaraproject_org_url: "https://..."       # Portfolio metadata
      display_name: "Device Location"            # Portfolio metadata
```

**Problems**:
- Portfolio changes require full re-analysis
- Data integrity risks (mixing facts with opinions)
- Difficult to update categories/URLs independently

#### Option B: Separate Files, Joined in Viewers
Store GitHub facts and portfolio metadata in separate files, join only in HTML viewers:
```
releases-master.yaml     → GitHub facts
api-portfolio.yaml       → Portfolio metadata
viewers/*.html           → Join data client-side with JavaScript
```

**Problems**:
- Requires runtime JavaScript in viewers
- Not compatible with static GitHub Pages hosting
- Reports would still need enriched data
- Complex client-side data processing

#### Option C: Runtime Enrichment (Chosen)
Store GitHub facts and portfolio metadata separately, enrich during report generation:
```
releases-master.yaml     → GitHub facts (source of truth)
api-landscape.yaml       → Portfolio metadata (enrichment source)
generate-reports.js      → Enriches during JSON generation
viewers/*.html           → Self-contained with embedded enriched data
```

---

## Decision

Implement **Runtime Enrichment Architecture** with clear separation between GitHub facts and portfolio metadata.

### Architecture Components

#### 1. Master Metadata (releases-master.yaml)
**Purpose**: Source of truth for GitHub facts

**Content**:
- Repository, release tag, release date, GitHub URL
- API name, version, title, commonalities version
- Meta-release assignment (derived from mappings)

**Update trigger**: New GitHub releases detected

**Example**:
```yaml
- repository: DeviceLocation
  release_tag: r1.3
  release_date: '2024-09-11T10:58:35Z'
  meta_release: Fall24
  github_url: https://github.com/camaraproject/DeviceLocation/releases/tag/r1.3
  apis:
    - api_name: device-location-verification
      file_name: device-location-verification
      version: 1.1.0
      title: Device Location Verification
      commonalities: '0.4'
```

#### 2. API Landscape (config/api-landscape.yaml)
**Purpose**: Portfolio metadata for enrichment

**Content**:
- API categories, display names, tooltips
- URLs to camaraproject.org pages
- Publication status, first release
- Previous names (for lookup)

**Update trigger**: Business decisions (categorization, website changes)

**Example**:
```yaml
- api_name: device-location-verification
  title: Device Location Verification
  category: Location and Tracking
  camaraproject_org_url: https://camaraproject.org/device-location-verification/
  display_name: Device Location Verification
  tooltip: Verify if a device is located within a specified area
  published: true
  first_release: Fall24
  previous_names: []
```

#### 3. Report Generation (generate-reports.js)
**Purpose**: Runtime enrichment during JSON report creation

**Process**:
1. Load releases-master.yaml (GitHub facts)
2. Load api-landscape.yaml (portfolio metadata)
3. For each API in each release:
   - Find matching landscape entry (by api_name or previous_names)
   - Merge facts + enrichments
   - Add computed fields (isNew, etc.)
4. Output enriched JSON reports

**Key function**:
```javascript
function enrichAPI(apiData, landscape) {
  const enrichment = findEnrichment(apiData.api_name, landscape);
  return {
    ...apiData,                    // GitHub facts
    ...enrichment,                 // Portfolio metadata
    isNew: calculateIsNew(...)     // Computed fields
  };
}
```

#### 4. Viewer Generation (generate-viewers.js)
**Purpose**: Create self-contained HTML files for static hosting

**Process**:
1. Load enriched JSON reports (already enriched)
2. Embed data directly in HTML templates
3. Output self-contained viewers (no external dependencies)

**Result**: Viewers work on GitHub Pages without backend

### Data Flow

```
┌─────────────────┐
│   GitHub API    │
└────────┬────────┘
         │
         ↓
┌─────────────────────┐
│ detect-releases.js  │  Find rX.Y tags
└────────┬────────────┘
         │
         ↓
┌─────────────────────┐
│ analyze-release.js  │  Extract API metadata, apply format corrections
└────────┬────────────┘
         │
         ↓
┌─────────────────────┐
│ update-master.js    │  Update releases-master.yaml (GitHub facts only)
└────────┬────────────┘
         │
         ↓
┌─────────────────────┐       ┌──────────────────┐
│ generate-reports.js │ ←──── │ api-landscape.yaml│  Portfolio metadata
└────────┬────────────┘       └──────────────────┘
         │                     Runtime enrichment happens here
         ↓
┌─────────────────────┐
│ Enriched JSON       │  reports/*.json (facts + enrichments)
│ Reports             │
└────────┬────────────┘
         │
         ↓
┌─────────────────────┐
│ generate-viewers.js │  Embed enriched data in HTML templates
└────────┬────────────┘
         │
         ↓
┌─────────────────────┐
│ Self-contained      │  viewers/*.html (static, no backend)
│ HTML Viewers        │
└─────────────────────┘
```

### Update Scenarios

#### Scenario 1: New GitHub Release
1. Workflow detects new release (incremental mode)
2. analyze-release.js extracts API metadata
3. update-master.js adds to releases-master.yaml
4. generate-reports.js enriches with existing landscape
5. generate-viewers.js creates updated HTML

**Files changed**: releases-master.yaml, reports/*.json, viewers/*.html

#### Scenario 2: Category Change
1. Update api-landscape.yaml (change category)
2. Run workflow with full re-analysis
3. releases-master.yaml unchanged (no GitHub changes)
4. generate-reports.js re-enriches with new categories
5. generate-viewers.js recreates HTML with new categories

**Files changed**: api-landscape.yaml, reports/*.json, viewers/*.html

#### Scenario 3: URL Update
1. Update api-landscape.yaml (change URL)
2. Run workflow with full re-analysis
3. releases-master.yaml unchanged
4. Reports and viewers regenerated with new URLs

**Files changed**: api-landscape.yaml, reports/*.json, viewers/*.html

---

## Consequences

### Benefits

1. **Clean separation of concerns**
   - GitHub facts in one place (releases-master.yaml)
   - Portfolio metadata in another (api-landscape.yaml)
   - Clear ownership and validation

2. **Independent updates**
   - Change categories without touching GitHub facts
   - Update URLs without re-analyzing releases
   - Portfolio evolution doesn't risk data corruption

3. **Fast portfolio updates**
   - Edit api-landscape.yaml
   - Run full re-analysis (regenerates reports)
   - No GitHub API calls needed (uses cached master)

4. **Data integrity**
   - releases-master.yaml is verifiable against GitHub
   - Portfolio changes can't corrupt factual data
   - Clear audit trail (what came from GitHub vs what we added)

5. **Flexibility**
   - Easy to add new enrichment fields
   - Can create multiple enrichment sources
   - Reports can combine multiple sources

6. **Static hosting compatible**
   - Viewers are self-contained HTML files
   - No backend required (GitHub Pages works)
   - No runtime JavaScript data loading

### Tradeoffs

1. **Two sources of truth**
   - Must maintain consistency between releases-master.yaml and api-landscape.yaml
   - API names must match between files
   - Requires previous_names for renames

2. **Full re-analysis needed**
   - Portfolio changes require full re-analysis to regenerate reports
   - Longer workflow run (5-10 minutes vs 2-5 minutes)
   - Acceptable for weekly/manual updates

3. **Complexity in generate-reports.js**
   - Must handle lookup logic (api_name, previous_names)
   - Must handle missing enrichments gracefully
   - More complex than embedded approach

4. **Duplication in outputs**
   - Enriched data stored in reports/*.json AND viewers/*.html
   - Acceptable tradeoff for static hosting

### Validation

To ensure architecture integrity:

1. **Master metadata validation** (validate-landscape.js)
   - Check all landscape entries have required fields
   - Validate URLs, categories
   - Ensure no orphaned entries

2. **Enrichment coverage**
   - generate-reports.js logs enrichment statistics
   - Warns when APIs lack landscape entries
   - Tracks enrichment success rate

3. **Data consistency**
   - Compare master metadata with GitHub periodically
   - Validate enriched reports have all required fields
   - Check viewers render correctly

---

## Related Decisions

- [ADR-0001: Feature-Grouped Organization](0001-feature-grouped-organization.md) - Workflow structure
- Future: ADR for viewer architecture (template-based generation)
- Future: ADR for format corrections approach

---

## References

- Phase 1 implementation: September 17-22, 2025
- Reorganization and testing: October 30-31, 2025
- Key discussion: Viewer requirements and static hosting constraints

---

*This ADR documents the core architectural decision that makes the meta-release collector maintainable and flexible. It separates immutable GitHub facts from evolving portfolio metadata, allowing independent updates while maintaining data integrity.*
