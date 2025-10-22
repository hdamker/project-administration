# Actions (per‑repo steps)

All actions are Node20, with TypeScript compiled to `dist/index.js` and committed.

- `read-release-data`  
  Inputs: `releases_file`, `repo_slug`  
  Outputs:  
    - `json` – stringified data for templating (Mustache).  
    - `summary` – small JSON with `latest_public_release` and `api_version` for reporting.

- `ensure-delimited-section`  
  Inputs: `file`, `start`, `end`, `placeholder`  
  Ensures the delimited section exists; writes only if missing.

- `render-mustache`  
  Inputs: `template`, `data_json`, `out_file`  
  Renders Mustache template to file. (Minimal Mustache implementation bundled – `{{key}}` and sections.)

- `replace-delimited-content`  
  Inputs: `file`, `start`, `end`, `new_content_file`  
  Replaces text between delimiters with the rendered content. Outputs `changed=true|false`.

These actions are intentionally tiny and composable. Extend inside TS and rebuild `dist/`.
