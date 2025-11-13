#!/usr/bin/env node

/**
 * Test Pipeline Script
 *
 * Tests the end-to-end data pipeline with a subset of repositories
 * to verify everything works before running the full workflow.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test with a small subset of repositories - using ACTUAL PUBLIC releases
const TEST_REPOS = [
  { name: 'QualityOnDemand', release: 'r1.2' },      // Fall24 - PUBLIC release
  { name: 'QualityOnDemand', release: 'r1.3' },      // Fall24 - PUBLIC release
  { name: 'DeviceRoamingStatus', release: 'r1.2' },  // Fall25 - PUBLIC release
  { name: 'SimSwap', release: 'r1.2' }               // Fall24 - PUBLIC release
];

console.log('🧪 Testing End-to-End Pipeline');
console.log('=' .repeat(50));

// Ensure temp directory exists
const tempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

try {
  // Step 1: Analyze each repository
  console.log('\n📊 Step 1: Analyzing repositories...\n');

  const analysisResults = [];

  for (const repo of TEST_REPOS) {
    console.log(`Analyzing ${repo.name} @ ${repo.release}...`);

    try {
      // Write to file to avoid console output issues
      const outputFile = path.join(tempDir, `${repo.name}-${repo.release}.json`);
      execSync(
        `GITHUB_TOKEN=$(gh auth token) node scripts/analyze-release.js --github "${repo.name}" "${repo.release}" > ${outputFile} 2>/dev/null`,
        { shell: '/bin/zsh' }
      );

      const result = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      analysisResults.push(result);

      console.log(`  ✓ Found ${result.apis.length} APIs`);
      result.apis.forEach(api => {
        console.log(`    - ${api.api_name} v${api.version}`);
      });
    } catch (error) {
      console.error(`  ✗ Error analyzing ${repo.name}: ${error.message}`);
    }
  }

  // Save combined analysis results
  const analysisFile = path.join(tempDir, 'test-combined-analysis.json');
  fs.writeFileSync(analysisFile, JSON.stringify(analysisResults, null, 2));
  console.log(`\n💾 Saved analysis results to ${analysisFile}`);

  // Step 2: Update master metadata
  console.log('\n📝 Step 2: Updating master metadata...\n');

  const output = execSync(
    `node scripts/update-master.js --mode full --input ${analysisFile}`,
    { encoding: 'utf8' }
  );

  console.log(output);

  // Step 3: Verify master metadata was updated
  console.log('\n✅ Step 3: Verifying master metadata...\n');

  const masterFile = path.join(__dirname, '..', 'data', 'releases-master.yaml');
  const yaml = require('js-yaml');
  const masterData = yaml.load(fs.readFileSync(masterFile, 'utf8'));

  console.log(`Total releases in master: ${masterData.releases.length}`);

  // Group by meta-release
  const byMetaRelease = {};
  for (const release of masterData.releases) {
    const mr = release.meta_release;
    if (!byMetaRelease[mr]) {
      byMetaRelease[mr] = { repos: new Set(), apis: 0 };
    }
    byMetaRelease[mr].repos.add(release.repository);
    byMetaRelease[mr].apis += release.apis.length;
  }

  console.log('\nBy Meta-Release:');
  for (const [mr, stats] of Object.entries(byMetaRelease)) {
    console.log(`  ${mr}: ${stats.repos.size} repositories, ${stats.apis} APIs`);
  }

  // Show sample of raw API names (no corrections)
  console.log('\nSample API names (raw):');
  for (const release of masterData.releases) {
    if (release.repository === 'QualityOnDemand') {
      for (const api of release.apis) {
        console.log(`  - ${api.api_name} (file: ${api.file_name})`);
      }
      break;
    }
  }

  console.log('\n🎉 Pipeline test completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Create generate-reports.js to produce meta-release JSON files');
  console.log('2. Create generate-viewers.js to embed data in HTML');
  console.log('3. Run full workflow with all repositories');

} catch (error) {
  console.error('\n❌ Pipeline test failed:', error.message);
  process.exit(1);
}