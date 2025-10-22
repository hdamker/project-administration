const core = require('@actions/core');
const fs = require('fs');

try {
  const file = core.getInput('file', { required: true });
  const start = core.getInput('start', { required: true });
  const end = core.getInput('end', { required: true });
  const newFile = core.getInput('new_content_file', { required: true });

  const orig = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const newContent = fs.readFileSync(newFile, 'utf8').replace(/\r\n/g, '\n').trim() + '\n';

  const startIdx = orig.indexOf(start);
  const endIdx = orig.indexOf(end, startIdx + start.length);
  if (startIdx === -1 || endIdx === -1) throw new Error('Delimiters not found; ensure-delimited-section must run first.');

  const before = orig.slice(0, startIdx + start.length);
  const after = orig.slice(endIdx);
  const next = before + '\n' + newContent + after;

  const changed = next !== orig;
  if (changed) fs.writeFileSync(file, next);
  core.setOutput('changed', changed ? 'true' : 'false');
} catch (err) {
  core.setFailed(err.message);
}
