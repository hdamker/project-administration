# Documentation Images

This directory contains visual assets for the Release Collector workflow documentation.

## Required Images

### workflow-visualization.png

**Description**: Screenshot showing the 7-phase workflow execution in GitHub Actions UI

**How to capture**:
1. Navigate to Actions tab in project-administration repository
2. Run the Release Collector v3 workflow
3. Once workflow completes, view the workflow run page
4. Take screenshot showing the visual workflow graph with all phases:
   - Detect New Releases
   - Matrix: Analyze Releases (showing parallel jobs)
   - Update Master Metadata
   - Generate HTML Viewers
   - Publish Changes
   - Deploy to Staging (GitHub Pages)
   - Workflow Summary

**Recommended dimensions**: 1200-1600px wide (capture full workflow visualization)

**Format**: PNG (for best quality with text)

**Current status**: Image provided by user, needs to be saved to this location

---

## Adding New Images

When adding documentation images:
1. Use descriptive filenames (kebab-case)
2. Optimize for web (compress PNGs)
3. Include alt text in markdown references
4. Document the image purpose in this README
5. Reference from documentation with relative paths

Example:
```markdown
![Description of image](images/your-image.png)
*Caption explaining what the image shows*
```
