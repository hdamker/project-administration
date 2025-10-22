const core = require('@actions/core');
const fs = require('fs');

try {
  const file = core.getInput('file', { required: true });
  const start = core.getInput('start', { required: true });
  const end = core.getInput('end', { required: true });
  const placeholder = core.getInput('placeholder', { required: true });

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
    core.info('Delimited section ensured in file');
  } else {
    core.info('Delimited section already present');
  }
} catch (err) {
  core.setFailed(err.message);
}
