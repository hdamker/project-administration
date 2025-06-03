# 📘 Sandbox API Repository Creation Automation for CAMARA

This document describes how to use the GitHub Action in the `tooling` repository to automate the setup of new API repositories within the CAMARA GitHub organization.

## 📋 Table of Contents

- [Purpose](#-purpose)
- [Prerequisites](#-prerequisites)
- [How to Use](#-how-to-use)
  - [Inputs](#-inputs)
- [What It Does](#-what-it-does)
  - [Repository](#-repository)
  - [Teams](#-teams)
  - [Files](#-files)
  - [Rulesets](#-rulesets)
  - [Cleanup](#-cleanup)
- [Requirements](#-requirements)
  - [GitHub Personal Access Token (PAT)](#-github-personal-access-token-pat)
  - [Environment Restrictions](#-environment-restrictions)
- [Required Template Files](#-required-template-files)
- [Testing Tips](#-testing-tips)
- [Troubleshooting](#-troubleshooting)
- [FAQ](#-frequently-asked-questions)
- [Customization Guide](#-customization-guide)

---

## 🚀 Purpose

To automate the initial setup of a new repository using the `Template_API_Repository` as a template, including:

- Creating a new repository from the template
- Setting metadata and repository settings
- Creating teams and assigning permissions (if in an organization)
- Adding CODEOWNERS based on a template
- Setting up branch protection rules
- Posting issues with initial checklists
- Cleaning up setup artifacts (workflow + templates)

---

## 📋 Prerequisites

Before running this workflow, ensure you have:

1. **Access to the `tooling` repository** in the CAMARA organization
2. **Appropriate permissions** to create repositories and teams in the organization
3. **PAT token** with required scopes (see [Requirements](#-requirements))
4. **Environment setup** in the `tooling` repository (see [Environment Restrictions](#-environment-restrictions))
5. **Template repository** (`Template_API_Repository`) must exist and be accessible

---

## ⚙️ How to Use

1. Go to the **Actions** tab of the `camaraproject/tooling` repository
2. Click on the **"Setup New Repository"** workflow in the left sidebar
3. Click the **"Run workflow"** button
4. Fill in the required inputs in the form
5. Click **"Run workflow"** to start the process
6. Monitor the workflow execution for any issues

### 🔢 Inputs

| Input | Required | Description | Example |
|-------|----------|-------------|---------|
| `repo_name` | Yes | Name of the new repository to create | `my-api-project` |
| `repo_wiki_page` | Yes | URL of the repository wiki page | `https://github.com/camaraproject/wiki/...` |
| `subproject_name` | No | Subproject/working group name (leave empty for independent sandbox repo) | `Identity API` |
| `subproject_wiki_page` | No | URL of the subproject wiki page | `https://github.com/camaraproject/wiki/...` |
| `mailinglist_name` | Yes | Mailing list name in the form "sp-xxx" | `sp-identity` |
| `initial_codeowners` | Yes | GitHub usernames with `@` | `@alice @bob` |
| `team_prefix` | No | Repository name in kebab-case for team creation (leave empty to create no teams) | `identity-api` |

---

## 📄 What It Does

### ✅ Repository

- **Checks out template repository**: Downloads `Template_API_Repository` contents
- **Creates new public repository** from the template with retry logic
- **Sets repository metadata**: Description, homepage (to wiki), and topic `sandbox-api-repository`
- **Configures repository features**: Enables issues and discussions, disables wiki

### ✅ Teams

**Team creation behavior:**
- **If `team_prefix` is provided**: Creates teams and manages memberships
  - `{team_prefix}_maintainers` (under maintainers team)
  - `{team_prefix}_codeowners` (under codeowners team)
  - Sets appropriate permissions and invites users
- **If `team_prefix` is empty**: Skips all team operations entirely
  - No teams created
  - No user invitations sent
  - No team permissions assigned
  - Behaves as if running without organization access

**When teams are created:**
- Sets appropriate permissions:
  - Maintainers: `triage` permission
  - Codeowners: `push` permission
  - Admins: `maintain` permission
- Adds specified codeowners to the codeowners team
- Validates GitHub users before adding them
- **Note**: Requires "Members: Read and write" organization permission

### ✅ Files

- **README.md**: Replaces placeholders with actual values:
  - Repository name, wiki links, subproject information, mailing list, codeowner information
- **Issue template config**: Updates `.github/ISSUE_TEMPLATE/config.yml` with repository name
- **CODEOWNERS file**: Generates from `templates/CODEOWNERS_TEMPLATE` template
- **Initial issues**: Creates from templates in `templates/issues/`:
  - Administrative tasks issue with automatic completion comment
  - Codeowner tasks issue with responsibilities
- Adds appropriate labels to issues for better organization

### ✅ Rulesets

- Syncs all rulesets from `Template_API_Repository` to new repository
- Preserves ruleset configurations, including:
  - Branch protection rules
  - Required reviews
  - Status check requirements
  - Merge requirements

### ✅ Cleanup

- Deletes template files from the newly created repository:
  - `templates/CODEOWNERS_TEMPLATE`
  - `templates/issues/initial-admin.md`
  - `templates/issues/initial-codeowners.md`
  - `templates/README.md`

---

## 🔐 Requirements

### 🔑 GitHub Personal Access Token (PAT)

- **Storage**: Repository environment secret named `GH_REPO_CREATE_TOKEN`
- **Type**: Fine-grained personal access token (FGPAT)
- **Repository access**: Allow access to:
  - `camaraproject/Template_API_Repository` (template source)
  - Target organization repositories where new repos will be created

#### Required Permissions:

**Repository permissions:**
- **Contents**: Read and write (for accessing and updating files)
- **Issues**: Read and write (for creating initial issues)
- **Metadata**: Read-only (for repository information)
- **Administration**: Read and write (for repo settings and team setup)

**Organization permissions:**
- **Members**: Read and write (for team creation, management, and user invitations)

#### Token Setup Steps:
1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Fine-grained personal access token"
3. Set expiration (recommended: 90 days)
4. Select "All repositories" for organization access
5. Configure permissions as listed above
6. Generate and copy the token

### 🛡 Environment Restrictions

- **Environment name**: `repo-setup` 
- **Location**: Must be configured in the `camaraproject/tooling` repository
- **Protection rules**: Recommended to add admin team as required reviewers

#### Environment Setup Steps:
1. Go to `camaraproject/tooling` repository **Settings → Environments**
2. Click **"New environment"**
3. Name: `repo-setup`
4. **Environment protection rules**:
   - Add `@camaraproject/admins` team as required reviewers
   - Optionally add deployment branches restriction
5. **Environment secrets**:
   - Add `GH_REPO_CREATE_TOKEN` with your fine-grained PAT

---

## 📦 Required Template Files

The following files must exist in the `Template_API_Repository`:

```
README.md                              # Root README with {{placeholders}}
.github/ISSUE_TEMPLATE/config.yml      # Issue template config with {{repo_name}}
templates/CODEOWNERS_TEMPLATE          # CODEOWNERS template
templates/issues/initial-admin.md      # Admin tasks issue template
templates/issues/initial-codeowners.md # Codeowners tasks issue template
templates/README.md                    # Template documentation (gets deleted)
```

### Placeholder Format:
- Use `{{placeholder_name}}` format in template files
- Available placeholders:
  - `{{repo_name}}` - Repository name
  - `{{repo_wiki_page}}` - Repository wiki URL
  - `{{subproject_name}}` - Subproject name
  - `{{subproject_wiki_page}}` - Subproject wiki URL
  - `{{mailinglist_name}}` - Mailing list name
  - `{{initial_codeowners}}` - Initial codeowners list

---

## 🧪 Testing Tips

- **Repository naming**: Use test names like `test-api-$(date +%s)` to avoid collisions
- **Personal testing**: Run in a personal account to skip org/team features
- **Post-creation checklist**: Verify after creation:
  - Repository metadata and settings
  - CODEOWNERS file and team permissions
  - Issue templates and comments
  - Branch protection rules applied
  - Template files removed (if cleanup enabled)
  - Issue template config updated with repo name

## 🛠 Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| **"Repository creation failed"** | GitHub orchestration service issue | Wait a few minutes and retry; check GitHub status |
| **"Cannot access teams endpoint"** | Missing "Members: Read and write" permission | Add organization permission to PAT |
| **"Team creation failed"** | Parent teams don't exist | Ensure `maintainers` and `codeowners` teams exist |
| **"Repository already exists"** | Name collision | Choose a different repository name |
| **"User invitations failed"** | Invalid username or non-existent users | Verify GitHub usernames include @ prefix |
| **"Template not found"** | Template repo inaccessible | Check PAT has access to Template_API_Repository |
| **"Environment not found"** | Missing repo-setup environment | Create environment in .github repository |

### Debug Information

The workflow includes comprehensive debugging that shows:
- Token permission analysis
- API response headers and error details
- Step-by-step progress with success/failure indicators
- Detailed error messages for troubleshooting

## ❓ Frequently Asked Questions

1. **Why did the workflow move to the `tooling` repository?**  
   For centralized management of CAMARA tooling and automation workflows.

2. **Can I run this for personal repositories?**  
   Yes, but team-related steps will be skipped automatically.

3. **How do I modify the template files?**  
   Edit files in the `Template_API_Repository`, not in the `tooling` repository.

4. **Can I add custom branch protection rules?**  
   Yes, add rulesets to the `Template_API_Repository` and they'll be copied automatically.

5. **What happens if the workflow fails partway through?**  
   The repository will be created but may be incomplete. You can run the workflow again or complete setup manually.

6. **How do I add more initial issues?**  
   Add more template files to the `templates/issues/` directory in the template repository.

## 🔧 Customization Guide

### Extending the Workflow

1. **Adding custom files**: Place template files in `templates/` directory of the template repository
2. **Modifying issue templates**: Edit files in `templates/issues/` of the template repository
3. **Adding team structure**: Modify the team creation section in the workflow
4. **Custom repository settings**: Modify the "Configure repository settings" step
5. **Additional file processing**: Add new steps similar to the README and config file updates

### Template Repository Structure

Maintain this structure in `Template_API_Repository`:
```
Template_API_Repository/
├── README.md                           # Main template with placeholders
├── .github/
│   └── ISSUE_TEMPLATE/
│       └── config.yml                  # Issue config with {{repo_name}}
└── templates/
    ├── CODEOWNERS_TEMPLATE             # Ownership template
    ├── README.md                       # Documentation (deleted after setup)
    └── issues/
        ├── initial-admin.md            # Admin tasks template
        └── initial-codeowners.md       # Codeowner tasks template
```

---

## 🔗 Related Resources

- [GitHub Fine-grained PATs Documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#creating-a-fine-grained-personal-access-token)
- [GitHub Environments Documentation](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [CAMARA API Design Guidelines](https://github.com/camaraproject/Commonalities/blob/main/documentation/CAMARA-API-Design-Guide.md)

---

For questions or issues, open an issue in the `tooling` repository or contact the CAMARA admin team.

---

*Last updated: May 2025*