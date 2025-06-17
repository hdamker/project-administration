# CAMARA Project Bulk Repository Administration

This system provides modular GitHub Actions workflows for managing bulk changes across all CAMARA project repositories with proper testing and safety mechanisms.

## Workflow Architecture

The system consists of three core workflows that work together:

### 1. Single Repository Test (`project-admin-single-repo-test.yml`)
- Tests operations on individual repositories before bulk execution
- Validates repository access and permissions
- Provides **structured result display** with detailed feedback and next steps guidance
- Shows the same result format as bulk operations for consistency
- **Always start here** when testing new operations

### 2. Repository Worker (`project-admin-repository-worker.yml`) 
- Reusable workflow component that executes operations on individual repositories
- Called by both single test and bulk workflows
- Handles all the actual file modifications and git operations
- Supports dry-run mode for safe testing
- **Generates standardized result metadata** for consistent reporting
- **Modular design** - Easy to add new operations with reusable git operations
- **Mixed operation types**: Supports both API-based operations (wiki, releases) and file-based operations (CODEOWNERS, file content)

### 3. Bulk Repository Changes (`project-admin-bulk-repository-changes.yml`)
- Orchestrates operations across multiple repositories simultaneously  
- Includes repository filtering and exclusion capabilities
- Runs operations in parallel with configurable limits
- Provides comprehensive execution summaries with **enhanced result categorization**

## Available Operations

### Current Operations
- **disable-wiki**: Safely disables GitHub wiki on repositories (only if wiki has no content)
- **add-changelog-codeowners**: Adds release management team as reviewers for CHANGELOG file changes (both .MD and .md variants)
- **add-changelog-file**: Adds template CHANGELOG.md file to repositories that have neither changelog nor releases
- **update-swagger-links**: Migrates swagger editor links to CAMARA's dedicated swagger-ui instance (in files)
- **update-swagger-links-releases**: Migrates swagger editor links to CAMARA's dedicated swagger-ui instance (in release descriptions)
- **update-api-readiness-checklist**: Adds line 13 (API description for marketing) to existing API-Readiness-Checklist.md files

### Operation Details

**disable-wiki:**
- ✅ Safety check: Only disables wiki if currently enabled but has no content
- ✅ Permission validation: Requires admin access to repository
- ✅ Content protection: Skips repositories where wiki contains content
- ✅ Clear status reporting: Different outcomes for various scenarios

**add-changelog-file:**
- ✅ **Smart decision logic**: Only acts when repository has neither CHANGELOG file nor releases
- ✅ **Template integration**: Downloads the official CHANGELOG.md template from Template_API_Repository
- ✅ **Safety checks**: 
  - Detects both `CHANGELOG.md` and `CHANGELOG.MD` filename variants
  - Checks for existing releases via GitHub API
  - Issues warnings for mismatched states (CHANGELOG without releases or releases without CHANGELOG)
- ✅ **File-based operation**: Creates pull requests for the new CHANGELOG.md file
- ✅ **Standard template**: Uses the same template as new API repositories
- ⚠️ Issues warnings for repositories with mismatched CHANGELOG/release states (requires manual review)

**add-changelog-codeowners:**
- ✅ **Comprehensive coverage**: Handles both `CHANGELOG.MD` and `CHANGELOG.md` filename variants
- ✅ Two commit strategies available:
  - **pull-request** (default): Always creates pull requests for changes
  - **direct-with-warning**: Attempts direct commit, issues warning if blocked (no PR created)
- ✅ Smart detection: Skips if CHANGELOG rules already exist (either variant)
- ✅ Only modifies existing CODEOWNERS files (won't create new ones)
- ✅ Preserves existing CODEOWNERS content
- ✅ Creates feature branch with unique timestamp-based naming (for PR strategy)
- ✅ Generates descriptive pull requests with proper context (for PR strategy)
- ⚠️ Issues warning if CODEOWNERS file is missing (requires investigation)

**update-swagger-links:**
- ✅ **Comprehensive link migration**: Replaces both `editor.swagger.io` and `editor-next.swagger.io` host URLs
- ✅ **Targeted file scanning**: Only processes README.md, README.MD, CHANGELOG.md, CHANGELOG.MD files
- ✅ **Simple URL replacement**: Replaces host portion only, preserves all query parameters and paths
- ✅ **Detailed reporting**: Shows exact count of links updated in each file
- ✅ **Safe operation**: Only modifies URLs that match the specific swagger editor hosts
- ✅ **CAMARA branding**: Migrates to `https://camaraproject.github.io/swagger-ui/` for consistent experience

**update-swagger-links-releases:**
- ✅ **API-based operation**: Updates release descriptions through GitHub API (no git operations)
- ✅ **Comprehensive link migration**: Replaces both `editor.swagger.io` and `editor-next.swagger.io` host URLs in all releases
- ✅ **Handles all releases**: Processes both published and draft releases
- ✅ **Pagination support**: Handles repositories with many releases (100+ releases)
- ✅ **Preserves release metadata**: Only updates description, preserves all other release data (assets, tags, etc.)
- ✅ **Simple URL replacement**: Replaces host portion only, preserves all query parameters and paths
- ✅ **Detailed reporting**: Shows exact count of links updated per release and lists affected releases
- ✅ **Safe operation**: Only modifies URLs that match the specific swagger editor hosts
- ✅ **Permission validation**: Requires `Contents: Write` permission for release modifications
- ✅ **CAMARA branding**: Migrates to `https://camaraproject.github.io/swagger-ui/` for consistent experience

**update-api-readiness-checklist:**
- ✅ **File discovery**: Automatically finds all `*API-Readiness-Checklist.md` files in repository
- ✅ **Smart detection**: Skips files that already have line 13 (API description for marketing)
- ✅ **Structure validation**: Only modifies files with expected format (line 12 present)
- ✅ **Precise insertion**: Adds line 13 after line 12 with proper table formatting
- ✅ **Multiple file support**: Handles repositories with multiple checklist files
- ✅ **File-based operation**: Creates pull requests for changes
- ⚠️ Skips files without expected structure (missing line 12) to prevent corruption

**New Line 13 Added:**
```
| 13 | API description (for marketing)              |   O   |         O         |    M    |    M   |      | [Wiki link](https://lf-camaraproject.atlassian.net/wiki/) |
```

**Requirements by Release Stage:**
- alpha: Optional (O)
- release-candidate: Optional (O)  
- initial public: Mandatory (M)
- stable public: Mandatory (M)

**Host Replacement Approach:**
```
FROM: https://editor.swagger.io/ → TO: https://camaraproject.github.io/swagger-ui/
FROM: https://editor-next.swagger.io/ → TO: https://camaraproject.github.io/swagger-ui/
```

This simple host replacement approach:
- ✅ **Preserves all query parameters** - `?url=...` and any other parameters remain intact
- ✅ **Avoids regex complexity** - No need to escape special characters or match query patterns
- ✅ **More robust** - Works regardless of what follows the host (paths, parameters, fragments)
- ✅ **Same end result** - Complete URLs are transformed correctly

**Link Transformation Example:**
```
FROM: https://editor.swagger.io/?url=https://raw.githubusercontent.com/camaraproject/QualityOnDemand/r2.2/code/API_definitions/quality-on-demand.yaml
TO:   https://camaraproject.github.io/swagger-ui/?url=https://raw.githubusercontent.com/camaraproject/QualityOnDemand/r2.2/code/API_definitions/quality-on-demand.yaml

FROM: https://editor-next.swagger.io/?url=https://raw.githubusercontent.com/camaraproject/DeviceLocation/r2.2/code/API_definitions/location-verification.yaml  
TO:   https://camaraproject.github.io/swagger-ui/?url=https://raw.githubusercontent.com/camaraproject/DeviceLocation/r2.2/code/API_definitions/location-verification.yaml
```

**CODEOWNERS Rules Added:**
```
/CHANGELOG.MD @camaraproject/release-management_reviewers
/CHANGELOG.md @camaraproject/release-management_reviewers
```

## Key Features

### **Modular Architecture (New!)**
- **Operation-specific steps**: Handle only file modifications
- **Reusable git operations**: Shared commit/PR/branch logic across all file-based operations
- **Standardized interface**: Environment variables for communication between operation and git steps
- **Easy extensibility**: Adding new operations requires only operation-specific logic

### Safety Mechanisms
- **Dry-run mode**: Test operations without making actual changes
- **Repository validation**: Verify access and permissions before execution
- **Parallel execution limits**: Prevent overwhelming GitHub API
- **Fail-fast disabled**: Continue processing other repos if one fails

### Enhanced Monitoring & Feedback
- **Structured result display**: Consistent formatting across single and bulk operations
- **Items requiring attention**: Automatic flagging of warnings and errors
- **Progress tracking**: Monitor execution across multiple repositories
- **Next steps guidance**: Contextual recommendations based on result types
- **Error handling**: Graceful handling of permission issues and failures
- **Change detection**: Only commit when actual changes are made

## Quick Start Guide

### 1. Setup
1. Create the workflow files in your repository (personal or organizational)
2. If running from personal repo targeting `camaraproject`:
   - Create a Personal Access Token with `repo` and `read:org` scopes
   - Add it as a repository secret named `CAMARA_BULK_CHANGE_TOKEN`

### 2. Recommended Testing Workflow
```
Single Repo Test (Dry Run) → Single Repo Test (Live) → Bulk Dry Run → Live Bulk Execution
```

### 3. Usage Examples

**Test on Single Repository:**
1. Go to Actions → "Single Repository Test"
2. Enter repository name (e.g., "DeviceStatus")
3. Select operation type:
   - **disable-wiki**: For disabling unused wikis (API-based)
   - **add-changelog-codeowners**: For release management setup (file-based)
   - **update-swagger-links**: For swagger editor migration in files (file-based)
   - **update-swagger-links-releases**: For swagger editor migration in releases (API-based)
   - **update-api-readiness-checklist**: For adding marketing description requirement to API checklists (file-based)
4. Enable dry-run mode
5. **Review structured results** with detailed feedback and next steps guidance

**Execute Bulk Changes:**
1. Go to Actions → "Bulk Repository Changes"  
2. Select operation type from dropdown
3. Choose repository categories and filters
4. Select commit strategy (for file-based operations)
5. Start with dry-run mode enabled
6. Review results and download artifacts
7. Re-run with dry-run disabled for live execution

## Adding New Operations

The modular design makes adding new operations simple:

```yaml
- name: Execute Operation - Your New Operation
  if: inputs.operation == 'your-new-operation'
  run: |
    echo "🔍 Doing your operation..."
    
    # Your file modification logic here
    sed -i 's/old/new/g' some-file.txt
    
    # Set standard interface variables
    echo "has_changes=true" >> $GITHUB_ENV
    echo "result_type=success" >> $GITHUB_ENV
    echo "details=Updated some-file.txt" >> $GITHUB_ENV
    echo "commit_message=chore: your operation description" >> $GITHUB_ENV
    echo "pr_title=chore: your operation title" >> $GITHUB_ENV
    echo "pr_body=Your PR description here" >> $GITHUB_ENV
```

The reusable git operations handle:
- ✅ Dynamic author detection from token
- ✅ Dry run handling
- ✅ Direct commit with fallbacks
- ✅ Pull request creation
- ✅ Branch protection compatibility
- ✅ Error handling and reporting

## Token Requirements & Permissions

**GitHub Actions Workflow Permissions:**
- `contents: write` - For reading/writing repository files
- `pull-requests: write` - For creating pull requests

**For File-Based Operations (CODEOWNERS, Swagger Links in Files, API Readiness Checklists):**
- **Required Permissions**: Contents: Write and Pull Requests: Write permissions
- **Token Scopes**: `repo` (for classic tokens) or `Contents: Write` + `Pull Requests: Write` (for FGPATs)
- **Method**: Uses git operations with automatic fallback to pull requests for protected branches
- **Dynamic Identity**: Automatically uses token's associated user identity for commits

**For Release-Based Operations (Swagger Links in Releases):**
- **Required Permissions**: Contents: Write permission (for release modifications)
- **Token Scopes**: `repo` (for classic tokens) or `Contents: Write` + `Metadata: Write` (for FGPATs)
- **Method**: Uses GitHub API to update release descriptions directly
- **Permission Check**: Automatically verified during API operations

**For Wiki Operations:**
- **Required Permissions**: Admin access to target repositories via your personal token
- **Token Scopes**: `repo` (full repository access)
- **Organization Role**: Must be organization owner or repository admin

**Setting up Personal Access Token:**
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with `repo` scope
3. Add token as repository secret named `CAMARA_BULK_CHANGE_TOKEN`
4. Token identity will be automatically used for git operations

## Best Practices

1. **Always test first**: Use single repository test before bulk operations
2. **Start with dry-run**: Review changes before live execution  
3. **Filter wisely**: Use repository filters to target specific subsets when appropriate
4. **Monitor execution**: Watch for failures and address them before continuing
5. **Verify results**: Check a few repositories manually after bulk operations
6. **Review attention items**: Address warnings and errors before proceeding with bulk operations

## Results and Reporting

### **Single Repository Test Results**
Enhanced structured results with:
- **Result type with emoji** (✅ success, ⚠️ warning, ❌ error, etc.)
- **Detailed information** including action taken and operation status
- **Attention flagging** for warnings/errors that need review
- **PR/commit links** when applicable
- **Contextual next steps** based on result type

### **Bulk Operation Results**
Comprehensive results available in multiple formats:
- **Job Summary**: Result type tables, attention items, repository results
- **Downloadable Artifacts**: Markdown reports, CSV data, JSON format
- **Enhanced categorization**: Standardized result types with visual indicators
- **Retention**: Results artifacts retained for 30 days

This system is designed to scale and evolve with the CAMARA project's administrative needs while maintaining reliability and ease of use.