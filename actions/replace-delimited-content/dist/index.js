const fs = require('fs');

function getInput(name) {
  return process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] || '';
}

function setOutput(name, value) {
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    fs.appendFileSync(output, `${name}=${value}\n`, 'utf8');
  } else {
    console.log(`::set-output name=${name}::${value}`);
  }
}

function setFailed(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

try {
  const file = getInput('file');
  const start = getInput('start');
  const end = getInput('end');
  const newFile = getInput('new_content_file');

  if (!file || !start || !end || !newFile) {
    throw new Error('Missing required inputs');
  }

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
  setOutput('changed', changed ? 'true' : 'false');
} catch (err) {
  setFailed(err.message);
}
