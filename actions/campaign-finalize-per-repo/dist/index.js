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

  const campaignData = JSON.parse(campaignDataStr);

  // Determine file names based on mode
  const outputName = mode === 'plan' ? 'plan' : 'results';

  // Build JSONL record
  const record = {
    repo,
    pr_would_be_created: changed && (!prStatus || prStatus === 'will_create'),
    reason: changed ? 'content_changed' : 'noop',
    ...campaignData,
    timestamp: new Date().toISOString()
  };

  // Add PR fields if provided
  if (prStatus) {
    record.pr_status = prStatus;
    record.pr_would_be_updated = prStatus === 'will_update';
    record.pr_modified_skip = prStatus === 'modified_skip';
  }
  if (prNumber) {
    record.pr_number = parseInt(prNumber, 10);
  }

  const jsonlLine = JSON.stringify(record) + '\n';
  fs.writeFileSync(path.join(process.env.GITHUB_WORKSPACE, `${outputName}.jsonl`), jsonlLine);

  // Build markdown summary
  const lines = [`### ${repo}`];

  // Status line
  if (prStatus) {
    const statusMessages = {
      'will_create': 'PR would be created',
      'will_update': `Existing PR would be updated (PR #${prNumber})`,
      'no_change': 'Existing PR wouldn\'t be changed',
      'modified_skip': `Existing PR can\'t be updated - modified by codeowner (PR #${prNumber})`
    };
    const action = changed ? 'WOULD apply' : 'skip (no changes)';
    lines.push(`- ${action}`);
    lines.push(`- PR status: ${statusMessages[prStatus]}`);
  } else {
    lines.push(changed ? '- WOULD apply (PR would be created)' : '- skip (no changes)');
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
