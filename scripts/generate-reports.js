#!/usr/bin/env node

/**
 * Generate Reports Script
 *
 * Generates JSON report files for each meta-release from the master metadata.
 * Applies runtime enrichment from API landscape data.
 * Creates separate files for Fall24, Spring25, Fall25, PreFall24, Sandbox, etc.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Import enrichment utilities
const {
  loadLandscape,
  findEnrichment,
  enrichReleaseData,
  generateEnrichedStatistics,
  createFlattenedAPIView,
  createRepositorySummary
} = require('./lib/enrichment');

// Paths
const DATA_PATH = path.join(__dirname, '..', 'data');
const REPORTS_PATH = path.join(__dirname, '..', 'reports');
const MASTER_FILE = path.join(DATA_PATH, 'releases-master.yaml');

/**
 * Load master metadata
 */
function loadMaster() {
  if (!fs.existsSync(MASTER_FILE)) {
    console.error('Master metadata file not found');
    process.exit(1);
  }
  return yaml.load(fs.readFileSync(MASTER_FILE, 'utf8'));
}

/**
 * Group releases by meta-release
 */
function groupByMetaRelease(releases) {
  const grouped = {};

  for (const release of releases) {
    const mr = release.meta_release || 'Others';
    if (!grouped[mr]) {
      grouped[mr] = [];
    }
    grouped[mr].push(release);
  }

  return grouped;
}

/**
 * Generate report for a meta-release with runtime enrichment
 */
function generateEnrichedReport(metaRelease, releases, landscape) {
  const timestamp = new Date().toISOString();
  const landscapeVersion = landscape?.metadata?.version || 'unknown';

  // Sort releases by repository name and release tag
  releases.sort((a, b) => {
    if (a.repository !== b.repository) {
      return a.repository.localeCompare(b.repository);
    }
    return a.release_tag.localeCompare(b.release_tag);
  });

  // Generate statistics using enriched data
  const statistics = generateEnrichedStatistics(releases);

  // Create repository summary
  const repositories = createRepositorySummary(releases);

  // Create flattened API view
  const apis = createFlattenedAPIView(releases);

  const report = {
    metadata: {
      generated: timestamp,
      meta_release: metaRelease,
      source: 'Meta-release Collector v3',
      landscape_version: landscapeVersion
    },
    statistics: statistics,
    repositories: repositories,
    releases: releases,
    apis: apis
  };

  return report;
}


/**
 * Main execution
 */
async function main() {
  console.log('📊 Generating Meta-release Reports with Runtime Enrichment');
  console.log('=' .repeat(60));

  // Ensure reports directory exists
  if (!fs.existsSync(REPORTS_PATH)) {
    fs.mkdirSync(REPORTS_PATH, { recursive: true });
  }

  // Load master metadata
  const master = loadMaster();
  console.log(`\nLoaded ${master.releases.length} releases from master metadata`);

  // Load API landscape for enrichment
  console.log('\nLoading API landscape data...');
  const landscape = loadLandscape();
  if (landscape) {
    console.log(`✓ Loaded landscape v${landscape.metadata.version} with ${Object.keys(landscape.apis).length} APIs`);
  } else {
    console.log('⚠️  No landscape data found - reports will not be enriched');
  }

  // Apply runtime enrichment to master data (without specific meta-release)
  const enrichedMaster = landscape ? enrichReleaseData(master, landscape) : master;

  // Group by meta-release
  const grouped = groupByMetaRelease(enrichedMaster.releases);
  console.log(`\nFound ${Object.keys(grouped).length} meta-releases:`);
  for (const [mr, releases] of Object.entries(grouped)) {
    console.log(`  - ${mr}: ${releases.length} releases`);
  }

  // Generate reports
  console.log('\nGenerating enriched reports...');

  // 1. Generate ALL releases report (everything)
  const allReport = generateEnrichedReport('All', enrichedMaster.releases, landscape);
  const allFilepath = path.join(REPORTS_PATH, 'all-releases.json');
  fs.writeFileSync(allFilepath, JSON.stringify(allReport, null, 2));
  console.log(`  ✓ all-releases.json - ${allReport.statistics.repositories_count} repos, ${allReport.statistics.apis_count} APIs`);

  // 2. Generate reports for the three meta-releases only
  const metaReleases = ['Fall24', 'Spring25', 'Fall25'];

  for (const metaRelease of metaReleases) {
    if (grouped[metaRelease]) {
      // Re-enrich with specific meta-release for isNew calculation
      const metaReleaseData = landscape ?
        grouped[metaRelease].map(release => ({
          ...release,
          apis: release.apis.map(api => {
            const enrichment = findEnrichment(api.api_name, landscape);
            return {
              ...api,
              isNew: enrichment && enrichment.first_release === metaRelease
            };
          })
        })) : grouped[metaRelease];

      const report = generateEnrichedReport(metaRelease, metaReleaseData, landscape);
      const filename = `${metaRelease.toLowerCase()}.json`;
      const filepath = path.join(REPORTS_PATH, filename);
      fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
      console.log(`  ✓ ${filename} - ${report.statistics.repositories_count} repos, ${report.statistics.apis_count} APIs`);
    } else {
      console.log(`  - ${metaRelease}: No releases found`);
    }
  }

  // Show enrichment statistics
  if (landscape) {
    console.log('\nEnrichment Statistics:');
    const enrichedCount = enrichedMaster.releases.reduce((count, release) =>
      count + release.apis.filter(api => api.portfolio_category).length, 0
    );
    const totalApis = enrichedMaster.releases.reduce((count, release) =>
      count + release.apis.length, 0
    );
    console.log(`  - APIs enriched: ${enrichedCount}/${totalApis}`);

    // Count APIs with previous names
    const apisWithPrevNames = enrichedMaster.releases.reduce((count, release) =>
      count + release.apis.filter(api => api.previous_names && api.previous_names.length > 0).length, 0
    );
    if (apisWithPrevNames > 0) {
      console.log(`  - APIs with previous names: ${apisWithPrevNames}`);
    }
  }

  console.log('\n✅ Reports generated successfully with runtime enrichment');
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = {
  loadMaster,
  groupByMetaRelease,
  generateEnrichedReport
};