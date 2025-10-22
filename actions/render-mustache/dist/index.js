const core = require('@actions/core');
const fs = require('fs');

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
  const templatePath = core.getInput('template', { required: true });
  const outFile = core.getInput('out_file', { required: true });
  let dataJson = core.getInput('data_json', { required: true });

  if (!(dataJson.startsWith('{') || dataJson.startsWith('['))) {
    if (fs.existsSync(dataJson)) {
      dataJson = fs.readFileSync(dataJson, 'utf8');
    }
  }

  const data = JSON.parse(dataJson);
  const tpl = fs.readFileSync(templatePath, 'utf8');
  const out = simpleMustache(tpl, data);

  fs.mkdirSync(require('path').dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, out);

  core.info(`Rendered template to ${outFile}`);
} catch (err) {
  core.setFailed(err.message);
}
