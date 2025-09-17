#!/usr/bin/env node

/**
 * Generate Reports Script
 *
 * Generates JSON report files for each meta-release from the master metadata.
 * Creates separate files for Fall24, Spring25, Fall25, Legacy, Sandbox, etc.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

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
 * Generate statistics for a meta-release
 */
function generateStatistics(releases) {
  const stats = {
    total_repositories: new Set(),
    total_apis: 0,
    api_types: {
      stable: 0,      // version >= 1.0.0
      initial: 0,     // version < 1.0.0
      rc: 0           // version contains -rc
    },
    unique_apis: new Set(),
    commonalities_versions: new Set()
  };

  for (const release of releases) {
    stats.total_repositories.add(release.repository);

    for (const api of release.apis) {
      stats.total_apis++;
      stats.unique_apis.add(api.api_name);

      // Determine API maturity
      if (api.version.includes('-rc')) {
        stats.api_types.rc++;
      } else if (api.version.match(/^[01]\./)) {
        stats.api_types.initial++;
      } else {
        stats.api_types.stable++;
      }

      // Track commonalities versions
      if (api.commonalities) {
        stats.commonalities_versions.add(api.commonalities);
      }
    }
  }

  return {
    repositories_count: stats.total_repositories.size,
    apis_count: stats.total_apis,
    unique_apis_count: stats.unique_apis.size,
    api_maturity: stats.api_types,
    commonalities_versions: Array.from(stats.commonalities_versions).sort()
  };
}

/**
 * Generate report for a meta-release
 */
function generateReport(metaRelease, releases) {
  const timestamp = new Date().toISOString();

  // Sort releases by repository name and release tag
  releases.sort((a, b) => {
    if (a.repository !== b.repository) {
      return a.repository.localeCompare(b.repository);
    }
    return a.release_tag.localeCompare(b.release_tag);
  });

  // Generate repository list with API counts
  const repositories = {};
  for (const release of releases) {
    if (!repositories[release.repository]) {
      repositories[release.repository] = {
        releases: [],
        total_apis: 0
      };
    }
    repositories[release.repository].releases.push({
      tag: release.release_tag,
      date: release.release_date,
      apis_count: release.apis.length
    });
    repositories[release.repository].total_apis += release.apis.length;
  }

  // Flatten all APIs for listing
  const allApis = [];
  for (const release of releases) {
    for (const api of release.apis) {
      allApis.push({
        api_name: api.api_name,
        version: api.version,
        repository: release.repository,
        release_tag: release.release_tag,
        title: api.title,
        commonalities: api.commonalities
      });
    }
  }

  // Sort APIs by name (handle null values for legacy releases)
  allApis.sort((a, b) => {
    const nameA = a.api_name || '';
    const nameB = b.api_name || '';
    return nameA.localeCompare(nameB);
  });

  const report = {
    metadata: {
      generated: timestamp,
      meta_release: metaRelease,
      source: 'Meta-Release Collector v3'
    },
    statistics: generateStatistics(releases),
    repositories: repositories,
    releases: releases,
    apis: allApis
  };

  return report;
}

/**
 * Main execution
 */
async function main() {
  console.log('📊 Generating Meta-Release Reports');
  console.log('=' .repeat(50));

  // Ensure reports directory exists
  if (!fs.existsSync(REPORTS_PATH)) {
    fs.mkdirSync(REPORTS_PATH, { recursive: true });
  }

  // Load master metadata
  const master = loadMaster();
  console.log(`\nLoaded ${master.releases.length} releases from master metadata`);

  // Group by meta-release
  const grouped = groupByMetaRelease(master.releases);
  console.log(`\nFound ${Object.keys(grouped).length} meta-releases:`);
  for (const [mr, releases] of Object.entries(grouped)) {
    console.log(`  - ${mr}: ${releases.length} releases`);
  }

  // Generate reports
  console.log('\nGenerating reports...');

  // 1. Generate ALL releases report (everything)
  const allReport = generateReport('All', master.releases);
  const allFilepath = path.join(REPORTS_PATH, 'all-releases.json');
  fs.writeFileSync(allFilepath, JSON.stringify(allReport, null, 2));
  console.log(`  ✓ all-releases.json - ${allReport.statistics.repositories_count} repos, ${allReport.statistics.apis_count} APIs`);

  // 2. Generate reports for the three meta-releases only
  const metaReleases = ['Fall24', 'Spring25', 'Fall25'];

  for (const metaRelease of metaReleases) {
    if (grouped[metaRelease]) {
      const report = generateReport(metaRelease, grouped[metaRelease]);
      const filename = `${metaRelease.toLowerCase()}.json`;
      const filepath = path.join(REPORTS_PATH, filename);
      fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
      console.log(`  ✓ ${filename} - ${report.statistics.repositories_count} repos, ${report.statistics.apis_count} APIs`);
    } else {
      console.log(`  - ${metaRelease}: No releases found`);
    }
  }

  console.log('\n✅ Reports generated successfully');
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
  generateStatistics,
  generateReport
};