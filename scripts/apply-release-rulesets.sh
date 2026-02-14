#!/usr/bin/env bash
# =========================================================================================
# CAMARA Project - Admin Script: Apply Release Automation Rulesets
#
# Creates or updates the 3 repository rulesets required by the release automation.
# Idempotent: safe to run multiple times on the same repository.
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
# =========================================================================================

set -euo pipefail

# Defaults
ORG="camaraproject"
DRY_RUN=false
REPOS=""

# GitHub Actions app actor_id for bypass rules
# actor_id=2 is the GitHub Actions integration (verify via existing rulesets if different)
ACTIONS_ACTOR_ID=2

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

# ── Ruleset Definitions ──────────────────────────────────────────────────────

# Ruleset 1: Snapshot branch protection
ruleset_snapshot_protection() {
  cat <<'JSONEOF'
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
    { "type": "non_fast_forward" },
    { "type": "deletion" },
    {
      "type": "push",
      "parameters": {
        "restrict_pushes": true
      }
    }
  ],
  "bypass_actors": [
    {
      "actor_id": ACTOR_ID_PLACEHOLDER,
      "actor_type": "Integration",
      "bypass_mode": "always"
    }
  ]
}
JSONEOF
}

# Ruleset 2: Release-review branch protection
ruleset_review_protection() {
  cat <<'JSONEOF'
{
  "name": "release-review-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/release-review/**"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "non_fast_forward" },
    { "type": "deletion" }
  ],
  "bypass_actors": [
    {
      "actor_id": ACTOR_ID_PLACEHOLDER,
      "actor_type": "Integration",
      "bypass_mode": "always"
    }
  ]
}
JSONEOF
}

# Ruleset 3: Release PR approval requirements
ruleset_pr_rules() {
  cat <<'JSONEOF'
{
  "name": "release-snapshot-pr-rules",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/release-snapshot/**"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
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

  # Replace actor_id placeholder
  payload=$(echo "$payload" | sed "s/ACTOR_ID_PLACEHOLDER/$ACTIONS_ACTOR_ID/g")

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

# ── Main ─────────────────────────────────────────────────────────────────────

echo "=== Release Automation Rulesets ==="
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

  # Apply all 3 rulesets
  REPO_OK=true
  for ruleset_fn in ruleset_snapshot_protection ruleset_review_protection ruleset_pr_rules; do
    payload=$($ruleset_fn)
    ruleset_name=$(echo "$payload" | jq -r '.name')

    if ! apply_ruleset "$repo" "$ruleset_name" "$payload"; then
      echo "  ERROR: Failed to apply '${ruleset_name}'"
      REPO_OK=false
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
