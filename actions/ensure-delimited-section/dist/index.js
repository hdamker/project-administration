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
    // Look for "## Release Information" heading (case-insensitive)
    const releaseHeadingMatch = orig.match(/^##\s+Release\s+Information\s*$/mi);

    if (!releaseHeadingMatch) {
      throw new Error('Release Information heading not found - repo skipped');
    }

    // Found Release Information heading - wrap entire section
    const headingStartIndex = releaseHeadingMatch.index;

    // Find next ## heading after Release Information
    const afterHeading = orig.slice(headingStartIndex + releaseHeadingMatch[0].length);
    const nextHeadingMatch = afterHeading.match(/^##\s+.+$/m);

    if (!nextHeadingMatch) {
      throw new Error('No section heading found after Release Information - repo skipped');
    }

    // Insert delimiters around the Release Information section
    const sectionEndIndex = headingStartIndex + releaseHeadingMatch[0].length + nextHeadingMatch.index;
    const before = orig.slice(0, headingStartIndex);
    const section = orig.slice(headingStartIndex, sectionEndIndex).trimEnd();
    const after = orig.slice(sectionEndIndex);
    next = before + start + '\n' + section + '\n' + end + '\n\n' + after;
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
