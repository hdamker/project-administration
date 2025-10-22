const fs = require('fs');
const path = require('path');

function getInput(name) {
  return process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] || '';
}

function setFailed(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function simpleMustache(tpl, data, parent = null) {
  // Enhanced mustache: {{key}} and array sections {{#items}}...{{/items}}
  // with parent context access
  tpl = tpl.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => {
    // Try current context first
    let val = key.split('.').reduce((o,k)=> (o && typeof o === 'object' ? o[k] : undefined), data);
    // If not found and we have parent context, try parent
    if ((val === undefined || val === null) && parent) {
      val = key.split('.').reduce((o,k)=> (o && typeof o === 'object' ? o[k] : undefined), parent);
    }
    return (val === undefined || val === null) ? '' : String(val);
  });

  tpl = tpl.replace(/\{\{#\s*([a-zA-Z0-9_.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/g,
    (_, key, inner) => {
      const val = key.split('.').reduce((o,k)=> (o && typeof o === 'object' ? o[k] : undefined), data);
      if (Array.isArray(val)) {
        return val.map(item => {
          // For arrays, pass parent context so items can access parent fields
          const itemContext = typeof item === 'object' ? item : { '.': item };
          return simpleMustache(inner, itemContext, data);
        }).join('');
      }
      return val ? simpleMustache(inner, data, parent) : '';
    });
  return tpl;
}

try {
  const templatePath = getInput('template');
  const outFile = getInput('out_file');
  let dataJson = getInput('data_json');

  if (!templatePath || !outFile || !dataJson) {
    throw new Error('Missing required inputs');
  }

  if (!(dataJson.startsWith('{') || dataJson.startsWith('['))) {
    if (fs.existsSync(dataJson)) {
      dataJson = fs.readFileSync(dataJson, 'utf8');
    }
  }

  const data = JSON.parse(dataJson);
  const tpl = fs.readFileSync(templatePath, 'utf8');
  const out = simpleMustache(tpl, data);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, out);

  console.log(`Rendered template to ${outFile}`);
} catch (err) {
  setFailed(err.message);
}
