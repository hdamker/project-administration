<a href="https://github.com/camaraproject/project-administration/commits/" title="Last Commit"><img src="https://img.shields.io/github/last-commit/camaraproject/project-administration?style=plastic"></a>
<a href="https://github.com/camaraproject/project-administration/issues" title="Open Issues"><img src="https://img.shields.io/github/issues/camaraproject/project-administration?style=plastic"></a>
<a href="https://github.com/camaraproject/project-administration/pulls" title="Open Pull Requests"><img src="https://img.shields.io/github/issues-pr/camaraproject/project-administration?style=plastic"></a>
<a href="https://github.com/camaraproject/project-administration/graphs/contributors" title="Contributors"><img src="https://img.shields.io/github/contributors/camaraproject/project-administration?style=plastic"></a>
<a href="https://github.com/camaraproject/project-administration" title="Repo Size"><img src="https://img.shields.io/github/repo-size/camaraproject/project-administration?style=plastic"></a>
<a href="https://github.com/camaraproject/project-administration/blob/main/LICENSE" title="License"><img src="https://img.shields.io/badge/License-Apache%202.0-green.svg?style=plastic"></a>
<a href="https://github.com/camaraproject/Governance/blob/main/ProjectStructureAndRoles.md" title="Working Group"><img src="https://img.shields.io/badge/Working%20Group-red?style=plastic"></a>
<!-- Choose one of the above four alternative badges and then delete the remaining ones including this task -->

# project-administration

Repository to develop and provide tooling and workflows to support the administration of CAMARA. Maintained under the supervision of TSC and the Release Management working group.

* CAMARA Governance: https://github.com/camaraproject/Governance
* Release Management repository: https://github.com/camaraproject/ReleaseManagement

## Scope

* Tooling for CAMARA Admin team to automated recurring and buld tasks across the repositories of CAMARA.
* The repository provides the admin team initially with:
  * A workflow to create new (Sandbox) API Repositories
  * A set of workflows which allows bulk changes across the repositories of CAMARA
  * Reporting workflows to support the administration of repositories and releases
* Started: May 2025

## (Release) Information

The repository has no regular releases, the workflows are continously updated based on current needs, tested versions are in `main` branch, versions under test are in other branches.

* Workflows are deployed within `.github/workflows`
* Documentation of the workflows is within /documentation

Current available workflows:

* **[API Repository Creation](documentation/project-admin-api-repository-creation.md)**
  * Please read the [documentation](documentation/project-admin-api-repository-creation.md) first
  * Requires environment `repository-creation` and a token `GH_REPO_CREATE_TOKEN` within that environment
* **[Project Bulk Repository Administration](documentation/project-admin-bulk-repository-adminstration.md)**
  * Set of three workflows which allows to develop, test and apply operations across all or a subset of CAMARA repositories
  * Please read the [documentation](documentation/project-admin-bulk-repository-adminstration.md) first
  * Requires an appropriate token within `CAMARA_BULK_CHANGE_TOKEN` (use of bot account recommended for git/PR operations)
* **[Project Reporting workflows](documentation/project-report-generation-workflows.md)**
  * Currently two different reporting workflows: "Repository Overview" and "API Releases"
  * Requires token `CAMARA_REPORT_TOKEN`, see [documentation](documentation/project-report-generation-workflows.md)

### Bulk Orchestrator v2 (Experimental)

**Status**: Under development on branch `feat-bulk-v2-dev`

A next-generation playbook-driven bulk orchestration system built with TypeScript. This is a complete rewrite designed to replace the legacy workflow-based bulk administration system with a more flexible and extensible approach.

**Key Features**:
- **Playbook-based configuration**: Define bulk operations in YAML files
- **Extensible operations**: Built-in TypeScript ops + custom Python scripts
- **Plan/Apply workflow**: Preview changes before applying (like Terraform)
- **Smart PR/Issue management**: Customizable templates with automatic de-duplication
- **Multiple output formats**: CSV, JSONL, and human-readable Markdown reports
- **Safety-first**: Dry-run by default, fail-fast option, idempotent operations

**Location**: All bulk-v2 components are in the [bulk/](bulk/) directory:
- [bulk/action/](bulk/action/) - TypeScript GitHub Action
- [bulk/playbooks/](bulk/playbooks/) - YAML playbook configurations
- [bulk/templates/](bulk/templates/) - PR and issue body templates
- [bulk/docs/](bulk/docs/) - Documentation (cookbook, development, governance)
- [bulk/ops-local/](bulk/ops-local/) - Python operation scripts

**Workflow**: [.github/workflows/bulk-run.yaml](.github/workflows/bulk-run.yaml)

**Documentation**:
- [Action README](bulk/action/README.md) - How to use the orchestrator
- [Cookbook](bulk/docs/cookbook.md) - Example playbooks and recipes
- [Development Guide](bulk/docs/development.md) - Local setup and testing
- [Governance](bulk/docs/governance.md) - DCO, CLA, and approval processes

**Requirements**:
- Token: `CAMARA_BULK_CHANGE_TOKEN` (same as legacy bulk workflows)
- Node.js 20+ for the TypeScript action
- Python 3.11+ for custom operation scripts

**Note**: This system is independent of the legacy bulk administration workflows. Both systems can coexist. The plan is to deprecate the legacy workflow-based system after bulk-v2 is proven in production.

## Contributing

* Issues and PRs for this repositories will be discussed within the meetings of the [Release Management working group](https://github.com/camaraproject/ReleaseManagement).
* Larger changes impacting multiple or all repositories will be discussed with issues in the Governance repository and approved by the [Technical Steering Committee (TSC)](https://lf-camaraproject.atlassian.net/wiki/x/0RDe).

* Mailing List (of CAMARA's admin team)
  * A message to the admin team CAMARA can be sent to <adm@lists.camaraproject.org>
