# Quick Usage Guide: Centralize Linting Workflows Operation

## What It Does
Migrates CAMARA API repositories from local linting configurations to centralized workflows that reference the tooling repository.

## Step-by-Step Usage

### 1. Test on Single Repository
```
Actions → Single Repository Test
- Repository: Choose a test repo (e.g., "DeviceStatus")
- Operation: centralize-linting-workflows
- Dry Run: ✅ (keep enabled for testing)
- Commit Strategy: pull-request
→ Run workflow
```

### 2. Review Results
The workflow will show:
- Current linting status (none/local/centralized)
- Files that would be removed (if any)
- Workflows that would be added
- Whether a PR would be created

### 3. Run Live on Single Repository
If dry run looks good:
```
Same settings but:
- Dry Run: ❌ (disabled)
→ Run workflow
```
This creates a real PR in the test repository.

### 4. Bulk Dry Run
```
Actions → Bulk Repository Changes
- Operation: centralize-linting-workflows
- Dry Run: ✅
- Include categories as needed
- Exclude repos: Governance,.github
→ Run workflow
```

### 5. Review Bulk Report
Download the artifact to see:
- Migration summary
- Which repos need migration
- Which are already centralized
- Total files to be removed/added

### 6. Execute Bulk Changes
If satisfied with dry run:
```
Same settings but:
- Dry Run: ❌
→ Run workflow
```

## What Repository Owners See

### PR Title
`admin: migrate to centralized linting workflows`

### PR Content Includes
- Clear explanation of changes
- Benefits of centralization
- **Detailed next steps** with manual testing instructions
- Warning for repos without prior linting

### Next Steps for Codeowners
1. Review linting results in PR checks
2. Fix linting errors directly in this PR
3. Monitor the new linting system
4. Test with additional rules (optional)
5. Monitor future PRs

## Expected Outcomes

### Repositories WITH Local Linting
- Old files removed (megalinter.yml, .spectral.yml, etc.)
- New centralized workflows added
- Smooth transition

### Repositories WITHOUT Linting
- New workflows added
- ⚠️ Warning about potential issues
- Clear guidance for cleanup

### Already Centralized Repositories
- Skipped automatically
- No changes made

## Tips
- Always start with dry run
- Test on 1-2 repos first
- Review reports carefully
- Be available to help codeowners with questions
- Expect repos without prior linting to need cleanup PRs