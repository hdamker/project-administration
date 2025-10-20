# Python Operations for Bulk Orchestrator

This directory contains Python-based operations that can be executed by the bulk orchestrator.

## Overview

Python operations provide an alternative to TypeScript operations, allowing you to:
- Use Python's rich ecosystem (YAML parsing, data processing, etc.)
- Write quick collector/auditing scripts
- Leverage existing Python tools and libraries

**Note:** Python operations **always trigger repository cloning** (lazy worktree pattern). If you need API-only operations that don't clone repositories, use TypeScript operations instead (see [operations-guide.md](../docs/operations-guide.md)).

## Contract

Python operations must follow this stdin/stdout JSON contract:

### Input (stdin)

```json
{
  "repo": {
    "owner": "camaraproject",
    "name": "QualityOnDemand",
    "fullName": "camaraproject/QualityOnDemand",
    "defaultBranch": "main"
  },
  "inputs": {
    "paths": ["**/*.yml", "**/*.yaml"]
  },
  "mode": "plan"
}
```

### Output (stdout)

```json
{
  "changes": [
    {"path": "file.txt", "before": "old", "after": "new"}
  ],
  "rows": [
    {"file": "api.yaml", "version": "wip"}
  ],
  "notes": ["Found 2 WIP APIs"]
}
```

**Fields**:
- `changes` (optional): Array of file modifications (for ops that write files)
- `rows` (optional): Array of data rows for stats/collection ops
- `notes` (optional): Array of informational messages

## Usage in Playbooks

Reference Python scripts by relative path from the workspace root:

```yaml
ops:
  - use: "bulk/ops-local/python/collect_yaml_has_wip.py"
    with:
      paths: ["code/API_definitions/*.yaml"]
```

## Example: WIP Detector

See [collect_yaml_has_wip.py](python/collect_yaml_has_wip.py) for a complete example.

```python
import sys, json, glob, yaml

def main():
    # Read JSON from stdin
    payload = json.load(sys.stdin)
    paths = payload.get("inputs", {}).get("paths", [])

    rows = []
    for pattern in paths:
        for path in glob.glob(pattern, recursive=True):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    doc = yaml.safe_load(f) or {}
                if isinstance(doc, dict) and doc.get("version") == "wip":
                    rows.append({"path": path, "version": "wip"})
            except Exception:
                pass

    # Write JSON to stdout
    print(json.dumps({"rows": rows}))

if __name__ == "__main__":
    main()
```

## Requirements

### Python Version

Python 3.11+ is recommended. The workflow installs Python automatically.

### Dependencies

If your operation needs external packages:

1. **List in workflow**: Update `.github/workflows/bulk-run.yaml`:
   ```yaml
   - name: Install Python deps
     run: pip install pyyaml requests
   ```

2. **Use standard library**: Prefer built-in modules (json, glob, re, etc.) when possible

## Error Handling

### Exit Codes

- **Exit 0**: Success (orchestrator will parse stdout)
- **Exit non-zero**: Error (orchestrator captures stderr in notes)

### Example

```python
import sys, json

try:
    payload = json.load(sys.stdin)
    # ... do work ...
    print(json.dumps({"rows": []}))
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
```

## Best Practices

### 1. Validate Input

```python
def main():
    payload = json.load(sys.stdin)

    # Validate required fields
    if "repo" not in payload:
        raise ValueError("Missing 'repo' in input")

    inputs = payload.get("inputs", {})
    paths = inputs.get("paths")
    if not paths:
        raise ValueError("Missing 'paths' in inputs")
```

### 2. Use Mode Parameter

```python
mode = payload.get("mode", "plan")

if mode == "plan":
    # Calculate what would change
    changes = compute_changes()
elif mode == "apply":
    # Actually write files
    apply_changes()
```

### 3. Handle File Encoding

```python
with open(path, "r", encoding="utf-8") as f:
    content = f.read()
```

### 4. Silent Failures for Missing Files

```python
for path in paths:
    try:
        with open(path, "r") as f:
            process(f)
    except FileNotFoundError:
        pass  # Skip missing files silently
    except Exception as e:
        # But log other errors
        print(f"Error processing {path}: {e}", file=sys.stderr)
```

## Testing Locally

### 1. Create Test Input

```bash
cat > /tmp/test-input.json <<'EOF'
{
  "repo": {"owner": "test", "name": "repo", "fullName": "test/repo", "defaultBranch": "main"},
  "inputs": {"paths": ["*.yaml"]},
  "mode": "plan"
}
EOF
```

### 2. Run Operation

```bash
cd /path/to/repo
python bulk/ops-local/python/your_operation.py < /tmp/test-input.json
```

### 3. Verify Output

```bash
python bulk/ops-local/python/your_operation.py < /tmp/test-input.json | jq .
```

## Performance Considerations

**Python vs TypeScript Operations:**

| Aspect | Python Operations | TypeScript Operations |
|--------|------------------|----------------------|
| **Repository Clone** | Always (even for API calls) | On-demand (lazy worktree) |
| **Startup Time** | Python interpreter startup | Already running |
| **Best For** | File analysis, data processing | API operations, performance-critical |
| **Concurrency** | 5-10 (limited by git I/O) | 15+ for API-only ops |

**When to use Python:**
- Need Python ecosystem (PyYAML, pandas, etc.)
- Quick prototyping
- File-heavy operations already

**When to use TypeScript:**
- API-only operations (issues, labels)
- Need maximum performance
- Want to avoid repository clone overhead

## Stats-Only Operations

For operations that only collect data (not modify files), omit `changes`:

```python
# Collector example: count files by type
counts = {"yaml": 0, "json": 0}
for pattern in ["*.yaml", "*.json"]:
    counts[pattern.split(".")[-1]] = len(glob.glob(pattern))

print(json.dumps({
    "rows": [counts],
    "notes": [f"Found {counts['yaml']} YAML and {counts['json']} JSON files"]
}))
```

**Note:** Even stats-only Python operations clone the repository. For pure API stats (no file access), use TypeScript operations.

## Common Patterns

### Pattern 1: YAML/JSON Analysis

```python
import yaml, json

doc = yaml.safe_load(open("api.yaml"))
version = doc.get("info", {}).get("version", "unknown")
```

### Pattern 2: File Modification

```python
changes = []
for file in glob.glob(pattern):
    with open(file, "r") as f:
        before = f.read()

    after = before.replace("old", "new")

    if before != after:
        changes.append({"path": file, "before": before, "after": after})
        if mode == "apply":
            with open(file, "w") as f:
                f.write(after)

print(json.dumps({"changes": changes}))
```

### Pattern 3: Multi-File Reporting

```python
rows = []
for file in glob.glob("**/*.yaml", recursive=True):
    doc = yaml.safe_load(open(file))
    rows.append({
        "file": file,
        "version": doc.get("info", {}).get("version"),
        "title": doc.get("info", {}).get("title")
    })

print(json.dumps({"rows": rows}))
```

## Debugging

### Enable Verbose Logging

```python
import logging
logging.basicConfig(level=logging.DEBUG, stream=sys.stderr)
logging.debug(f"Processing {len(files)} files")
```

### Capture Stderr

The orchestrator captures stderr and includes it in `notes` when the operation fails.

```python
print("Detailed diagnostic info", file=sys.stderr)
```

## Security

### Avoid Shell Injection

```python
# DON'T: subprocess with shell=True
subprocess.run(f"cat {file}", shell=True)  # UNSAFE

# DO: subprocess with array
subprocess.run(["cat", file])  # SAFE
```

### Validate File Paths

```python
import os
if ".." in path or path.startswith("/"):
    raise ValueError(f"Invalid path: {path}")
```

## Examples Library

See `bulk/playbooks/` for playbooks using Python operations.

Common operations:
- `collect_yaml_has_wip.py` - Find YAML files with version: wip
- More examples coming soon...

## Contributing

When adding new operations:
1. Follow the stdin/stdout JSON contract
2. Add comprehensive error handling
3. Include docstrings and comments
4. Test with sample input
5. Add example to cookbook
