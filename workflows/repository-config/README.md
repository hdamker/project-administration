# Repository Configuration

Declares repository rulesets and `main` branch protection once, and reports where a repository differs.

## Declared configuration

All declarations live in [config/](../../config/):

| File | Content |
|---|---|
| `repositories.yaml` | One entry per organisation repository: `ruleset_class`, `single_codeowner`, `legacy_releases`, `archived` |
| `ruleset-classes.yaml` | Which rulesets each ruleset class carries, the rulesets added by a registry flag, the retired ruleset names |
| `rulesets/<name>.json` | The ruleset as GitHub returns it, without the fields GitHub sets itself |

Ruleset classes:

- `api-repository`: the release rulesets, `release-tag-protection` and the two `main` rulesets.
- `non-api`: the two `main` rulesets.
- `unmanaged`: not touched.

A repository with `legacy_releases: true` also carries `legacy-release-protection`, whatever its class: the release branches from before the release automation (`release-0*`, `release-v*`) cannot be created, updated or deleted, except by organisation administrators.

The `main` rulesets are `Only_Codeowner_Can_Merge` (code owner review, no further approval) and `Codeowner_review_required` (one approval). A repository with `single_codeowner: true` carries only the first; `plan` compares the flag with the `*` line of the default branch's `CODEOWNERS`, where a team counts as several people.

A GitHub repository without an entry in `repositories.yaml` is reported as `unregistered`. Archived repositories are skipped; the `archived` flag is compared with GitHub.

### Bypass actors

Actor IDs are literal in the ruleset files.

| `actor_id` | `actor_type` | Actor |
|---|---|---|
| `2865881` | `Integration` | `camara-release-automation` GitHub App |
| `13109132` | `Team` (required reviewer) | `release-management_reviewers` |
| `null` | `OrganizationAdmin` | Organisation administrators |

## What `plan` reports

Per repository, rulesets are matched by name:

| Live ruleset | Action |
|---|---|
| declared for the ruleset class, missing | `create` |
| declared for the ruleset class, content differs | `update`, with a diff |
| declared for another ruleset class, or retired | `remove` |
| any other name | `unmanaged`, listed and left alone |

Rulesets replace classic branch protection entirely. Every classic rule is reported as `remove-classic-protection`; it is read and deleted with GraphQL (`branchProtectionRules`), because a pattern rule such as `main*` cannot be removed through the REST branch-protection endpoint. `apply` deletes classic rules only after all declared rulesets of the repository are confirmed `active`, and fails if any classic rule is still present afterwards.

Comparison drops `id`, `source`, `source_type`, `node_id`, `_links`, `created_at`, `updated_at` and `current_user_can_bypass`, sorts `rules` and `bypass_actors`, and compares everything else exactly, `enforcement` included.

## Usage

Run from this directory. Authentication is `GITHUB_TOKEN`, or the `gh` login if unset.

```bash
python -m scripts.cli plan [--repos A,B] [--verbose]
python -m scripts.cli apply --repos A,B [--yes]
python -m scripts.cli export --repo A --ruleset NAME
python -m scripts.cli check-entry --repo A --ruleset-class api-repository --codeowners "@a @b"
```

- `plan` exits 0 without drift, 2 with drift, 1 on error.
- `apply` needs a repository list, re-plans each repository, shows the plan and asks before changing anything. Order: create and update, then remove, then classic protection. Writes are not retried on a server error (the write may have happened); run `apply` again, which re-plans first. Writes are not retried on a server error (the write may have happened); run `apply` again, which re-plans first.
- `check-entry` is used by the repository creation workflow: the entry must exist, have the expected `ruleset_class` and a `single_codeowner` flag that matches the initial codeowners.
- `export` writes a live ruleset to `config/rulesets/NAME.json`. Reading `bypass_actors` needs write access to the ruleset.

The workflow [repository-config-plan.yml](../../.github/workflows/repository-config-plan.yml) runs `plan` weekly and on dispatch with the `camara-repository-config` GitHub App and fails on drift. `apply` runs from the command line only.

## Tests

```bash
python -m pytest workflows/repository-config/tests
```

Tests run against API responses recorded in `tests/fixtures/repos/`.
