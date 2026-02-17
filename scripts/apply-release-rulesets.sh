#!/usr/bin/env bash
# =========================================================================================
# CAMARA Project - Admin Script: Apply Release Automation Ruleset
#
# Creates or updates the repository ruleset required by the release automation.
# Also removes legacy rulesets from earlier versions if present.
# Idempotent: safe to run multiple times on the same repository.
#
# The ruleset protects release-snapshot/** branches:
# - Only the camara-release-automation GitHub App can create/push/delete
# - Humans must use PRs with 2 approvals, code owner review, and RM team approval
#
# PREREQUISITES:
# - gh CLI authenticated with a Fine-grained PAT that has:
#   - Repository Administration: Read and Write
#   - Organization: Read (for listing repos)
#
# USAGE:
#   ./apply-release-rulesets.sh --repos "ReleaseTest,QualityOnDemand" [--org camaraproject] [--dry-run]
#   ./apply-release-rulesets.sh --repos "ReleaseTest" --dry-run
#
# REFERENCE:
# The canonical ruleset was created manually in Template_API_Repository and serves
# as the reference. This script replicates that configuration to existing repos.
# See: camaraproject/tooling release_automation/docs/repository-setup.md
#
# =========================================================================================

set -euo pipefail

# Defaults
ORG="camaraproject"
DRY_RUN=false
REPOS=""

# camara-release-automation GitHub App actor_id (same as App ID)
# Verified from Template_API_Repository ruleset extraction
APP_ACTOR_ID=2865881

# release-management_reviewers team ID (required reviewer for Release PRs)
RM_REVIEWERS_TEAM_ID=13109132

usage() {
  echo "Usage: $0 --repos <comma-separated-repos> [--org <org>] [--dry-run]"
  echo ""
  echo "Options:"
  echo "  --repos     Comma-separated list of repository names (required)"
  echo "  --org       GitHub organization (default: camaraproject)"
  echo "  --dry-run   Report what would be done without applying changes"
  echo ""
  echo "Examples:"
  echo "  $0 --repos ReleaseTest --dry-run"
  echo "  $0 --repos 'ReleaseTest,QualityOnDemand' --org camaraproject"
  exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --repos) REPOS="$2"; shift 2 ;;
    --org) ORG="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [ -z "$REPOS" ]; then
  echo "Error: --repos is required"
  usage
fi

# ── Ruleset Definition ───────────────────────────────────────────────────────

# Single combined ruleset: branch protection + PR review requirements
# Matches the manually created ruleset in Template_API_Repository
ruleset_snapshot_protection() {
  cat <<JSONEOF
{
  "name": "release-snapshot-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/release-snapshot/**"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "creation" },
    { "type": "update" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 2,
        "dismiss_stale_reviews_on_push": true,
        "required_reviewers": [
          {
            "minimum_approvals": 1,
            "file_patterns": ["*"],
            "reviewer": {
              "id": ${RM_REVIEWERS_TEAM_ID},
              "type": "Team"
            }
          }
        ],
        "require_code_owner_review": true,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge", "squash", "rebase"]
      }
    }
  ],
  "bypass_actors": [
    {
      "actor_id": ${APP_ACTOR_ID},
      "actor_type": "Integration",
      "bypass_mode": "always"
    }
  ]
}
JSONEOF
}

# ── Helper Functions ─────────────────────────────────────────────────────────

# Apply or update a single ruleset for a repository
apply_ruleset() {
  local repo="$1"
  local ruleset_name="$2"
  local payload="$3"

  # Check if ruleset already exists
  local existing_id
  existing_id=$(gh api "repos/${ORG}/${repo}/rulesets" \
    --jq ".[] | select(.name == \"${ruleset_name}\") | .id" 2>/dev/null || echo "")

  if [ -n "$existing_id" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "  [dry-run] Would UPDATE ruleset '${ruleset_name}' (id: ${existing_id})"
    else
      echo "$payload" | gh api -X PUT "repos/${ORG}/${repo}/rulesets/${existing_id}" \
        --input - -H "Accept: application/vnd.github+json" > /dev/null
      echo "  Updated ruleset '${ruleset_name}' (id: ${existing_id})"
    fi
  else
    if [ "$DRY_RUN" = true ]; then
      echo "  [dry-run] Would CREATE ruleset '${ruleset_name}'"
    else
      local new_id
      new_id=$(echo "$payload" | gh api -X POST "repos/${ORG}/${repo}/rulesets" \
        --input - -H "Accept: application/vnd.github+json" --jq '.id')
      echo "  Created ruleset '${ruleset_name}' (id: ${new_id})"
    fi
  fi
}

# Remove a legacy ruleset if it exists
remove_legacy_ruleset() {
  local repo="$1"
  local ruleset_name="$2"

  local legacy_id
  legacy_id=$(gh api "repos/${ORG}/${repo}/rulesets" \
    --jq ".[] | select(.name == \"${ruleset_name}\") | .id" 2>/dev/null || echo "")

  if [ -n "$legacy_id" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "  [dry-run] Would DELETE legacy ruleset '${ruleset_name}' (id: ${legacy_id})"
    else
      gh api -X DELETE "repos/${ORG}/${repo}/rulesets/${legacy_id}" \
        -H "Accept: application/vnd.github+json" > /dev/null
      echo "  Deleted legacy ruleset '${ruleset_name}' (id: ${legacy_id})"
    fi
  fi
}

# ── Main ─────────────────────────────────────────────────────────────────────

echo "=== Release Automation Ruleset ==="
echo "Organization: ${ORG}"
echo "Mode: $([ "$DRY_RUN" = true ] && echo 'DRY RUN' || echo 'APPLY')"
echo ""

# Parse comma-separated repos
IFS=',' read -ra REPO_LIST <<< "$REPOS"

TOTAL=0
SUCCESS=0
FAILED=0

for repo in "${REPO_LIST[@]}"; do
  repo=$(echo "$repo" | xargs)  # trim whitespace
  [ -z "$repo" ] && continue

  echo "Repository: ${ORG}/${repo}"

  # Verify repository exists and is accessible
  if ! gh api "repos/${ORG}/${repo}" --jq '.name' > /dev/null 2>&1; then
    echo "  ERROR: Repository not found or not accessible"
    FAILED=$((FAILED + 1))
    TOTAL=$((TOTAL + 1))
    continue
  fi

  REPO_OK=true

  # Apply the combined ruleset
  payload=$(ruleset_snapshot_protection)
  ruleset_name=$(echo "$payload" | jq -r '.name')

  if ! apply_ruleset "$repo" "$ruleset_name" "$payload"; then
    echo "  ERROR: Failed to apply '${ruleset_name}'"
    REPO_OK=false
  fi

  # Remove legacy rulesets from earlier versions (if present)
  for legacy_name in "release-review-protection" "release-snapshot-pr-rules"; do
    if ! remove_legacy_ruleset "$repo" "$legacy_name"; then
      echo "  WARNING: Failed to remove legacy ruleset '${legacy_name}'"
    fi
  done

  if [ "$REPO_OK" = true ]; then
    SUCCESS=$((SUCCESS + 1))
  else
    FAILED=$((FAILED + 1))
  fi
  TOTAL=$((TOTAL + 1))
  echo ""
done

echo "=== Summary ==="
echo "Total: ${TOTAL} | Success: ${SUCCESS} | Failed: ${FAILED}"
echo "Mode: $([ "$DRY_RUN" = true ] && echo 'DRY RUN (no changes applied)' || echo 'APPLIED')"
