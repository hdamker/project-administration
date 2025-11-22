# Compliance Schemas

This directory contains JSON Schema definitions (in YAML format) for validating compliance workflow configuration and data files.

## Schema Files

### [compliance-checks-schema.yaml](compliance-checks-schema.yaml)

Validates [config/compliance-checks.yaml](../config/compliance-checks.yaml) structure.

**Validates:**
- Version and metadata fields
- Check definitions (id, name, description, category, etc.)
- Severity values (critical, high, medium, low)
- Enforcement types (fail, warn, log)
- Phase tracking (implemented field)

### [repository-registry-schema.yaml](repository-registry-schema.yaml)

Validates [config/repository-registry.yaml](../config/repository-registry.yaml) structure.

**Validates:**
- Metadata fields (version, last_updated, description)
- Repository entries (name, category required)
- Category values (api-sandbox, api-incubating, etc.)
- Optional fields (sub_project, required_maintainers, exceptions)
- Exception references (must be valid check IDs)

### [repository-state-schema.yaml](repository-state-schema.yaml)

Validates auto-generated repository-state.yaml structure.

**Validates:**
- Metadata fields (generated_at, workflow_run)
- Repository state entries
- GitHub API data (topics, description, license, etc.)
- File presence checks
- Directory structure checks
- Branch protection configuration

## Validation Approach

All schemas use JSON Schema Draft 07 format in YAML syntax for consistency with other workflow configurations.

### Validation Tools

**Node.js (Recommended):**
```bash
npm install ajv ajv-formats
```

**Example validation:**
```javascript
const Ajv = require('ajv');
const yaml = require('js-yaml');
const fs = require('fs');

const ajv = new Ajv();
const schema = yaml.load(fs.readFileSync('schemas/compliance-checks-schema.yaml'));
const data = yaml.load(fs.readFileSync('config/compliance-checks.yaml'));

const validate = ajv.compile(schema);
const valid = validate(data);

if (!valid) {
  console.error(validate.errors);
}
```

**Python (Alternative):**
```bash
pip install pyyaml jsonschema
```

**Example validation:**
```python
import yaml
import jsonschema

with open('schemas/compliance-checks-schema.yaml') as f:
    schema = yaml.safe_load(f)

with open('config/compliance-checks.yaml') as f:
    data = yaml.safe_load(f)

jsonschema.validate(data, schema)
```

## Validation Commands

The workflow includes built-in validation scripts:

```bash
# Validate compliance checks configuration
node scripts/validate-compliance-checks.js

# Validate repository registry
node scripts/validate-registry.js
```

These scripts perform:
- Schema validation
- Cross-reference validation (e.g., check IDs, category names)
- Uniqueness checks (e.g., no duplicate IDs)
- Business logic validation

## Schema Versioning

Schemas follow the configuration file versions they validate. Breaking changes to schemas require configuration version bumps.

## References

- [JSON Schema Documentation](https://json-schema.org/)
- [JSON Schema Draft 07 Spec](https://json-schema.org/draft-07/schema)
