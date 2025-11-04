#!/usr/bin/env node

/**
 * Generate self-contained HTML viewers for CAMARA meta-releases
 *
 * This script embeds shared library, styles, and data into HTML templates
 * to create fully self-contained viewer files for GitHub Pages deployment.
 */

const fs = require('fs').promises;
const path = require('path');

// Paths relative to this script's location
const SCRIPT_DIR = __dirname;
const ROOT_DIR = path.join(SCRIPT_DIR, '../../..');
const TEMPLATES_DIR = path.join(SCRIPT_DIR, '../templates');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');
const VIEWERS_DIR = path.join(ROOT_DIR, 'viewers');

/**
 * Check if viewer needs regeneration based on source file timestamps
 * @param {string} release - Release name (e.g., 'fall25')
 * @returns {Promise<boolean>} True if regeneration needed
 */
async function shouldRegenerateViewer(release) {
  const reportPath = path.join(REPORTS_DIR, `${release}.json`);
  const viewerPath = path.join(VIEWERS_DIR, `${release}.html`);

  // Template files that affect viewer output
  const templateFiles = [
    path.join(TEMPLATES_DIR, 'viewer-lib.js'),
    path.join(TEMPLATES_DIR, 'viewer-styles.css'),
    path.join(TEMPLATES_DIR, 'meta-release-template.html')
  ];

  try {
    // Check if viewer exists
    const viewerStat = await fs.stat(viewerPath);
    const viewerTime = viewerStat.mtime.getTime();

    // Check if report is newer
    const reportStat = await fs.stat(reportPath);
    if (reportStat.mtime.getTime() > viewerTime) {
      console.log(`  ↻ Report data updated (${release})`);
      return true;
    }

    // Check if any template is newer
    for (const templateFile of templateFiles) {
      const templateStat = await fs.stat(templateFile);
      if (templateStat.mtime.getTime() > viewerTime) {
        const templateName = path.basename(templateFile);
        console.log(`  ↻ Template ${templateName} updated (${release})`);
        return true;
      }
    }

    console.log(`  ✓ Viewer up-to-date (${release})`);
    return false;

  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`  + Viewer missing (${release})`);
      return true; // Viewer doesn't exist, needs generation
    }
    throw err;
  }
}

/**
 * Generate meta-release viewer for a specific release
 */
async function generateMetaReleaseViewer(release, options = {}) {
  try {
    console.log(`\nGenerating ${release} viewer...`);

    // Load shared library and styles
    const libraryPath = path.join(TEMPLATES_DIR, 'viewer-lib.js');
    const stylesPath = path.join(TEMPLATES_DIR, 'viewer-styles.css');
    const templatePath = path.join(TEMPLATES_DIR, 'meta-release-template.html');

    console.log(`  Loading shared library from: ${libraryPath}`);
    const library = await fs.readFile(libraryPath, 'utf8');

    console.log(`  Loading shared styles from: ${stylesPath}`);
    const styles = await fs.readFile(stylesPath, 'utf8');

    console.log(`  Loading template from: ${templatePath}`);
    const template = await fs.readFile(templatePath, 'utf8');

    // Load enriched report data
    const reportPath = path.join(REPORTS_DIR, `${release}.json`);
    console.log(`  Loading report data from: ${reportPath}`);
    const reportData = JSON.parse(await fs.readFile(reportPath, 'utf8'));

    // Apply data filters based on options
    let filteredData = { ...reportData };
    if (options.publishedOnly) {
      console.log(`  Filtering for published APIs only...`);
      // Filter at the release level - keep releases but filter their APIs
      if (filteredData.releases) {
        filteredData.releases = filteredData.releases.map(release => ({
          ...release,
          apis: release.apis.filter(api => api.published)
        })).filter(release => release.apis.length > 0); // Remove releases with no published APIs
      }
    }

    // Count APIs for logging
    let apiCount = 0;
    if (filteredData.releases) {
      filteredData.releases.forEach(release => {
        apiCount += release.apis.length;
      });
    }
    console.log(`  Data contains ${apiCount} APIs in ${filteredData.releases?.length || 0} releases`);

    // Embed everything into template
    console.log(`  Embedding library, styles, and data...`);
    let html = template;

    // Replace placeholders
    html = html.replace('{{VIEWER_LIBRARY}}', library);
    html = html.replace('{{VIEWER_STYLES}}', styles);
    html = html.replace('{{RELEASE_DATA}}', JSON.stringify(filteredData, null, 2));
    html = html.replace(/{{META_RELEASE}}/g, filteredData.metadata.meta_release);

    // Write self-contained HTML file
    const outputFilename = options.outputFilename || `${release}.html`;
    const outputPath = path.join(VIEWERS_DIR, outputFilename);

    console.log(`  Writing viewer to: ${outputPath}`);
    await fs.writeFile(outputPath, html, 'utf8');

    console.log(`✓ Generated ${outputFilename} (${apiCount} APIs)`);

    return {
      filename: outputFilename,
      path: outputPath,
      apiCount: apiCount,
      releaseCount: filteredData.releases?.length || 0
    };
  } catch (error) {
    console.error(`✗ Error generating ${release} viewer:`, error.message);
    throw error;
  }
}

/**
 * Generate all meta-release viewers
 */
async function generateAllViewers() {
  console.log('=== CAMARA Viewer Generation v3 ===\n');

  try {
    // Ensure output directory exists
    console.log(`Creating output directory: ${VIEWERS_DIR}`);
    await fs.mkdir(VIEWERS_DIR, { recursive: true });

    const results = [];

    // Determine which releases to generate
    const releases = ['fall24', 'spring25', 'fall25'];

    // Check which reports exist
    const existingReleases = [];
    for (const release of releases) {
      const reportPath = path.join(REPORTS_DIR, `${release}.json`);
      try {
        await fs.access(reportPath);
        existingReleases.push(release);
      } catch (err) {
        console.log(`⚠ Report not found: ${release}.json - skipping`);
      }
    }

    if (existingReleases.length === 0) {
      console.error('\n✗ No report files found. Run the meta-release collector first.');
      process.exit(1);
    }

    // Generate meta-release viewers with timestamp checking
    let regenerated = 0;
    let skipped = 0;

    for (const release of existingReleases) {
      if (await shouldRegenerateViewer(release)) {
        const result = await generateMetaReleaseViewer(release, {
          publishedOnly: true
        });
        results.push(result);
        regenerated++;
      } else {
        console.log(`  ⊘ Skipping ${release} (unchanged)`);
        skipped++;
      }
    }

    // Summary
    console.log('\n=== Generation Summary ===');
    console.log(`Regenerated: ${regenerated} viewers`);
    console.log(`Skipped: ${skipped} viewers`);
    console.log(`Total available: ${existingReleases.length} releases`);
    if (results.length > 0) {
      console.log('\nRegenerated viewers:');
      results.forEach(result => {
        console.log(`  - ${result.filename}: ${result.apiCount} APIs, ${result.releaseCount} releases`);
      });
    }
    console.log(`\nViewers directory: ${VIEWERS_DIR}`);

  } catch (error) {
    console.error('\n✗ Error during viewer generation:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes('-h') || args.includes('--help')) {
    console.log(`
CAMARA Viewer Generator v3

Usage:
  node generate-viewers.js [release]

Options:
  release    Optional release name (fall24, spring25, fall25)
             If omitted, generates all available releases

Examples:
  node generate-viewers.js              # Generate all releases
  node generate-viewers.js fall25       # Generate only Fall25 viewer
`);
    process.exit(0);
  }

  // Check if specific release requested
  if (args.length > 0) {
    const release = args[0];
    console.log(`Generating single release: ${release}`);
    await generateMetaReleaseViewer(release, { publishedOnly: true });
  } else {
    await generateAllViewers();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for potential use as module
module.exports = {
  generateMetaReleaseViewer,
  generateAllViewers
};