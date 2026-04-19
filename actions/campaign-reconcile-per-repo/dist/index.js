const fs = require('fs');
const path = require('path');

function getInput(name) {
  return process.env[`INPUT_${name.toUpperCase()}`] || '';
}

try {
  const repo = getInput('repo');
  const mode = getInput('mode');
  const campaignDataStr = getInput('campaign_data') || '{}';
  let prStatus = getInput('pr_status');
  const prNumber = getInput('pr_number');
  const prUrl = getInput('pr_url');
  const nonBotShas = getInput('non_bot_shas').trim();
  const treeMatch = getInput('tree_match') === 'true';
  const errorOccurred = getInput('error_occurred') === 'true';
  const errorMessage = getInput('error_message');
  const errorStep = getInput('error_step');

  const campaignData = JSON.parse(campaignDataStr);
  const outputName = mode === 'plan' ? 'plan' : 'results';

  // When we rebuild the branch and the resulting tree is identical to what's
  // already on the remote branch, the force-push is skipped. Reflect that in
  // the outcome so runs don't report "updated existing PR" when nothing moved.
  if (prStatus === 'will_update_existing' && treeMatch) {
    prStatus = 'no_change_vs_existing_pr';
  }

  // Map pr_status → reason + human-readable status
  const statusMap = {
    will_create:              { reason: 'new_changes',  human: 'New PR would be created on stable branch' },
    will_update_existing:     { reason: 'new_changes',  human: 'Existing PR would be updated (force-push)' },
    no_change_vs_existing_pr: { reason: 'in_sync_with_existing_pr', human: 'No change vs existing PR — push skipped to preserve approvals' },
    will_close_stale:         { reason: 'in_sync',      human: 'Stale PR would be closed (repo in sync)' },
    no_change:                { reason: 'in_sync',      human: 'No changes needed' },
    aborted:                  { reason: 'non_bot_commits_on_branch', human: 'Aborted — non-bot commits on stable branch' },
  };

  const record = {
    repo,
    ...campaignData,
    timestamp: new Date().toISOString(),
  };

  if (errorOccurred) {
    record.error = true;
    record.error_message = errorMessage;
    record.error_step = errorStep;
    record.status = 'error';
  } else {
    const mapping = statusMap[prStatus] || { reason: prStatus, human: prStatus };
    record.pr_status = prStatus;
    record.reason = mapping.reason;
    record.pr_would_be_created = prStatus === 'will_create';
    record.pr_would_be_updated = prStatus === 'will_update_existing';
    record.pr_would_be_closed = prStatus === 'will_close_stale';
    record.aborted = prStatus === 'aborted';
    if (treeMatch) record.tree_match = true;

    if (prNumber) record.pr_number = parseInt(prNumber, 10);
    if (prUrl) record.pr_url = prUrl;
    if (nonBotShas) record.non_bot_shas = nonBotShas.split(/\s+/).filter(Boolean);
  }

  const jsonlLine = JSON.stringify(record) + '\n';
  fs.writeFileSync(path.join(process.env.GITHUB_WORKSPACE, `${outputName}.jsonl`), jsonlLine);

  // Markdown summary
  const lines = [`### ${repo}`];
  if (errorOccurred) {
    lines.push(`- ERROR: ${errorMessage}`);
    lines.push(`- Failed at step: ${errorStep}`);
    lines.push(`- Status: Skipped`);
  } else {
    const mapping = statusMap[prStatus] || { reason: prStatus, human: prStatus };
    const verb = mode === 'plan' ? 'WOULD' : 'DID';
    lines.push(`- ${verb} ${mapping.human}`);
    if (prUrl) lines.push(`- PR URL: ${prUrl}`);
    if (prStatus === 'aborted' && nonBotShas) {
      lines.push(`- Non-bot SHAs on branch: ${nonBotShas}`);
    }
  }

  for (const [key, value] of Object.entries(campaignData)) {
    lines.push(`- ${key}: ${value !== null && value !== undefined ? value : 'N/A'}`);
  }

  const md = lines.join('\n') + '\n';
  fs.writeFileSync(path.join(process.env.GITHUB_WORKSPACE, `${outputName}.md`), md);

  console.log(`Recorded outcome to ${outputName}.jsonl and ${outputName}.md`);
} catch (err) {
  console.error(`::error::${err.message}`);
  process.exit(1);
}
