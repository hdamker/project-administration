#!/usr/bin/env node

/**
 * Generate Viewers Script
 *
 * Generates HTML viewers with embedded JSON data for each report.
 * Uses the viewer template and embeds the JSON data directly.
 */

const fs = require('fs');
const path = require('path');

// Paths
const REPORTS_PATH = path.join(__dirname, '..', 'reports');
const VIEWERS_PATH = path.join(__dirname, '..', 'viewers');
const TEMPLATE_FILE = path.join(VIEWERS_PATH, 'release-dashboard-template.html');

/**
 * Generate viewer HTML with embedded data
 */
function generateViewer(reportFile, title) {
  // Load the report JSON
  const reportPath = path.join(REPORTS_PATH, reportFile);
  if (!fs.existsSync(reportPath)) {
    console.error(`Report file not found: ${reportFile}`);
    return false;
  }

  const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  // Load the template
  if (!fs.existsSync(TEMPLATE_FILE)) {
    console.error('Template file not found');
    return false;
  }

  let template = fs.readFileSync(TEMPLATE_FILE, 'utf8');

  // Replace the title in multiple places
  template = template.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
  template = template.replace(/CAMARA API Release Dashboard - Template/, title);

  // Replace the heading
  template = template.replace(
    /<h1>.*?CAMARA API Release Dashboard<\/h1>/,
    `<h1>🚀 ${title}</h1>`
  );

  // Remove sample data warning if it exists
  template = template.replace(/<!--\s*Sample data.*?-->/gs, '');

  // Replace the sample data structure with actual data
  // Find and replace the entire releaseData declaration
  const sampleDataRegex = /let releaseData = \{[\s\S]*?\n    \};/;

  // Transform our report structure to match what the template expects
  // The template expects api.name not api.api_name
  const transformedReleases = reportData.releases.map(release => ({
    ...release,
    apis: release.apis.map(api => ({
      name: api.api_name,  // Template expects 'name'
      version: api.version,
      title: api.title,
      commonalities: api.commonalities
    }))
  }));

  const actualData = {
    metadata: {
      ...reportData.metadata,
      last_updated: reportData.metadata.generated  // Template expects last_updated
    },
    releases: transformedReleases
  };

  const dataReplacement = `let releaseData = ${JSON.stringify(actualData, null, 6)};`;
  template = template.replace(sampleDataRegex, dataReplacement);

  return template;
}

/**
 * Main execution
 */
async function main() {
  console.log('🎨 Generating HTML Viewers');
  console.log('=' .repeat(50));

  // Ensure viewers directory exists
  if (!fs.existsSync(VIEWERS_PATH)) {
    fs.mkdirSync(VIEWERS_PATH, { recursive: true });
  }

  // Check for template
  if (!fs.existsSync(TEMPLATE_FILE)) {
    console.error('\n❌ Template file not found!');
    console.error(`Expected at: ${TEMPLATE_FILE}`);
    process.exit(1);
  }

  // Define viewers to generate
  const viewers = [
    {
      report: 'all-releases.json',
      output: 'all-releases.html',
      title: 'CAMARA All Releases Dashboard'
    },
    {
      report: 'fall24.json',
      output: 'fall24.html',
      title: 'CAMARA Fall 2024 Release Dashboard'
    },
    {
      report: 'spring25.json',
      output: 'spring25.html',
      title: 'CAMARA Spring 2025 Release Dashboard'
    },
    {
      report: 'fall25.json',
      output: 'fall25.html',
      title: 'CAMARA Fall 2025 Release Dashboard'
    }
  ];

  console.log('\nGenerating viewers...');

  for (const viewer of viewers) {
    // Check if report exists
    const reportPath = path.join(REPORTS_PATH, viewer.report);
    if (!fs.existsSync(reportPath)) {
      console.log(`  - Skipping ${viewer.output} (report not found)`);
      continue;
    }

    // Generate viewer HTML
    const html = generateViewer(viewer.report, viewer.title);
    if (html) {
      const outputPath = path.join(VIEWERS_PATH, viewer.output);
      fs.writeFileSync(outputPath, html);

      // Get file size for display
      const stats = fs.statSync(outputPath);
      const size = (stats.size / 1024).toFixed(1);
      console.log(`  ✓ ${viewer.output} (${size} KB)`);
    }
  }

  console.log('\n✅ Viewers generated successfully');
  console.log(`\nViewers can be opened directly in a browser:`);
  console.log(`  file://${path.join(VIEWERS_PATH, 'all-releases.html')}`);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = {
  generateViewer
};