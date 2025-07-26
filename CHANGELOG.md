# Changelog for project-administration

## Table of Contents

- **[r1.1](#r11)**

## r1.1

**This is the first release of the CAMARA project-administration repository.**

The repository provides tooling and workflows to support the administration of CAMARA, maintained under the supervision of TSC and the Release Management working group.

### Please note:

The repository has no regular releases schedule. Workflows are continuously updated based on current needs. Tested versions are in the `main` branch, while versions under test are in other branches.

### Added

* **API Repository Creation Workflow** (`project-admin-api-repository-creation.yml`)
  - Automates creation of new API repositories from `Template_API_Repository`
  - Supports dry-run mode for validation without creating resources
  - Creates and configures repository teams with proper permissions
  - Handles CODEOWNERS setup, issue creation, and branch protection rules
  - Includes comprehensive input validation and error handling
  - Requires `repository-creation` environment with `GH_REPO_CREATE_TOKEN`

* **Bulk Repository Administration Workflows**
  - **Single Repository Test** (`project-admin-single-repo-test.yml`)
    - Test operations on individual repositories before bulk execution
    - Provides structured result display with detailed feedback
    - Supports dry-run mode for safe testing
  
  - **Repository Worker** (`project-admin-repository-worker.yml`)
    - Reusable workflow component for executing operations
    - Handles both API-based and file-based operations
    - Supports multiple commit strategies (pull-request, direct-with-warning)
  
  - **Bulk Repository Changes** (`project-admin-bulk-repository-changes.yml`)
    - Orchestrates operations across multiple repositories
    - Includes repository filtering by category and name patterns
    - Parallel execution with configurable limits

* **Available Bulk Operations**
  - `disable-wiki`: Safely disables GitHub wiki (only if no content)
  - `add-changelog-codeowners`: Adds release management team as CHANGELOG reviewers
  - `add-changelog-file`: Adds template CHANGELOG.md to repositories without releases
  - `update-swagger-links`: Migrates swagger editor links to CAMARA swagger-ui
  - `update-swagger-links-releases`: Updates swagger links in release descriptions
  - `update-api-readiness-checklist`: Adds line 13 (API description for marketing)

* **Repository Reporting Workflows**
  - **Repository Overview** (`project-report-camara-repository-overview.yml`)
    - Weekly automated reports with repository health monitoring
    - 9-point template compliance verification for API repositories
    - Activity analysis with simple and detailed modes
    - Organization-wide statistics by repository type
    - Scheduled to run weekly on Mondays at 07:35 UTC
  
  - **API Releases Report** (`project-report-camara-api-releases.yml`)
    - Parallel processing for 70% faster execution (3-5 minutes)
    - Meta-release analysis (Fall24/Spring25/Fall25 categorization)
    - API version tracking from OpenAPI specifications
    - Consistency validation between main branch and releases
    - Filters for pre-releases and legacy releases

### Changed

* Initial release - no changes from previous versions

### Deprecated

* The following bulk operations are already used, and now included in new repositories,
will be removed in a next release:
  - `disable-wiki`: Safely disables GitHub wiki (only if no content)
  - `add-changelog-codeowners`: Adds release management team as CHANGELOG reviewers
  - `update-api-readiness-checklist`: Adds line 13 (API description for marketing)

### Removed

* Initial release - no removed features

### Fixed

* Initial release - no fixes required

### Security

* All workflows require appropriate GitHub tokens with specific permissions:
  - `CAMARA_BULK_CHANGE_TOKEN` for bulk operations
  - `GH_REPO_CREATE_TOKEN` for repository creation (in protected environment)
  - `CAMARA_REPORT_TOKEN` for reporting workflows
* Repository creation workflow uses protected `repository-creation` environment
* Dry-run mode available for all modification operations

### Known Issues

* Bulk operations are limited to 5 parallel executions to avoid API rate limits

### What's Next

* Additional bulk operations for common administrative tasks
* Enhanced reporting capabilities

---

**Note:** This repository provides administrative tooling for the CAMARA project. For questions or issues, please open an issue in this repository or contact the CAMARA admin team at adm@lists.camaraproject.org