const fs = require('fs');
const path = require('path');

function getInput(name) {
  return process.env[`INPUT_${name.toUpperCase()}`] || '';
}

try {
  const repo = getInput('repo');
  const changed = getInput('changed') === 'true';
  const mode = getInput('mode');
  const campaignDataStr = getInput('campaign_data') || '{}';
  const prStatus = getInput('pr_status');
  const prNumber = getInput('pr_number');
  const prUrl = getInput('pr_url');
  const changeReason = getInput('change_reason');

  const campaignData = JSON.parse(campaignDataStr);

  // Determine file names based on mode
  const outputName = mode === 'plan' ? 'plan' : 'results';

  // Build JSONL record
  const record = {
    repo,
    pr_would_be_created: changed && prStatus === 'will_create',
    reason: changeReason || (changed ? 'content_changed' : 'noop'),
    ...campaignData,
    timestamp: new Date().toISOString()
  };

  // Add PR fields if provided
  if (prStatus) {
    record.pr_status = prStatus;
  }
  if (prNumber) {
    record.pr_number = parseInt(prNumber, 10);
  }
  if (prUrl) {
    record.pr_url = prUrl;
  }

  const jsonlLine = JSON.stringify(record) + '\n';
  fs.writeFileSync(path.join(process.env.GITHUB_WORKSPACE, `${outputName}.jsonl`), jsonlLine);

  // Build markdown summary
  const lines = [`### ${repo}`];

  // Status line
  if (prStatus) {
    const statusMessages = {
      'will_create': 'New PR would be created',
      'no_change': prNumber ? `No changes needed (latest PR #${prNumber})` : 'No changes needed'
    };
    const reasonMessages = {
      'main_up_to_date': 'main already up-to-date',
      'duplicate_of_pr': 'identical to existing PR',
      'new_changes': 'new changes detected'
    };
    const action = changed ? 'WOULD apply' : 'skip';
    lines.push(`- ${action}`);
    lines.push(`- PR status: ${statusMessages[prStatus]}`);
    if (changeReason) {
      lines.push(`- Reason: ${reasonMessages[changeReason] || changeReason}`);
    }
  } else {
    lines.push(changed ? '- WOULD apply (PR would be created)' : '- skip (no changes)');
  }

  // Add PR URL if available
  if (prUrl) {
    lines.push(`- PR URL: ${prUrl}`);
  }

  // Add campaign-specific fields
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
