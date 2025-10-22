const fs = require('fs');

function getInput(name) {
  return process.env[`INPUT_${name.toUpperCase()}`] || '';
}

function setFailed(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

try {
  const file = getInput('file');
  const start = getInput('start');
  const end = getInput('end');
  const placeholder = getInput('placeholder');

  if (!file || !start || !end || !placeholder) {
    throw new Error('Missing required inputs');
  }

  const exists = fs.existsSync(file);
  const orig = exists ? fs.readFileSync(file, 'utf8') : '';
  const hasStart = orig.includes(start);
  const hasEnd = orig.includes(end);
  let next = orig;

  if (!hasStart && !hasEnd) {
    // Try to insert after first ## heading
    const headingMatch = orig.match(/^##\s+.+$/m);
    if (headingMatch) {
      const headingEndIndex = headingMatch.index + headingMatch[0].length;
      const before = orig.slice(0, headingEndIndex);
      const after = orig.slice(headingEndIndex);
      next = before + '\n\n' + `${start}\n${placeholder}\n${end}\n` + after;
    } else {
      // No heading found, append at end
      next = orig + (orig.endsWith('\n') ? '' : '\n') + `\n${start}\n${placeholder}\n${end}\n`;
    }
  } else if (hasStart && !hasEnd) {
    // Has start but missing end - add end after start
    const startIdx = orig.indexOf(start);
    const insertPos = startIdx + start.length;
    next = orig.slice(0, insertPos) + '\n' + placeholder + '\n' + end + '\n' + orig.slice(insertPos);
  } else if (!hasStart && hasEnd) {
    // Has end but missing start - add start before end
    const endIdx = orig.indexOf(end);
    next = orig.slice(0, endIdx) + start + '\n' + placeholder + '\n' + orig.slice(endIdx);
  }
  // else: both present, no changes needed

  if (next !== orig) {
    fs.writeFileSync(file, next);
    console.log('Delimited section ensured in file');
  } else {
    console.log('Delimited section already present');
  }
} catch (err) {
  setFailed(err.message);
}
