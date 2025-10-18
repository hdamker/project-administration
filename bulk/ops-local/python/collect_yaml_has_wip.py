import sys, json, glob, yaml
def main():
    payload = json.load(sys.stdin)
    paths = payload.get("inputs", {}).get("paths", [])
    rows = []
    for pattern in paths:
        for path in glob.glob(pattern, recursive=True):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    doc = yaml.safe_load(f) or {}
                if isinstance(doc, dict) and doc.get("version") == "wip":
                    rows.append({"path": path})
            except Exception:
                pass
    print(json.dumps({"rows": rows}))
if __name__ == "__main__":
    main()
