#!/usr/bin/env node

/**
 * Simple Workflow Test
 *
 * Tests the workflow using detect-releases to get the list of releases,
 * following the exact pattern the GitHub Actions workflow will use.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Workflow with detect-releases');
console.log('=' .repeat(50));

// Ensure directories exist
const tempDir = path.join(__dirname, '..', 'temp');
const reportsDir = path.join(__dirname, '..', 'reports');
const viewersDir = path.join(__dirname, '..', 'viewers');

[tempDir, reportsDir, viewersDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

try {
  // Step 1: Detect releases to analyze
  console.log('\n🔍 Step 1: Detecting releases to analyze...\n');

  // Run detect-releases in full mode to get all rX.Y releases
  execSync(
    'GITHUB_TOKEN=$(gh auth token) node scripts/detect-releases.js --mode full > temp/detection-output.json 2>temp/detection.log',
    { shell: '/bin/zsh' }
  );

  const detectionOutput = JSON.parse(
    fs.readFileSync(path.join(tempDir, 'detection-output.json'), 'utf8')
  );

  console.log(`Found ${detectionOutput.releases_count} releases from ${detectionOutput.repositories_affected} repositories`);
  console.log('\nRepository summary:');
  for (const [repo, count] of Object.entries(detectionOutput.repository_summary || {})) {
    console.log(`  ${repo}: ${count} releases`);
  }

  // Step 2: Analyze detected releases
  console.log('\n📊 Step 2: Analyzing detected releases...\n');

  const analysisResults = [];
  const releasesToAnalyze = detectionOutput.releases_to_analyze.slice(0, 30); // Limit for testing

  for (const release of releasesToAnalyze) {
    console.log(`Analyzing ${release.repository} @ ${release.release_tag}...`);

    try {
      const outputFile = path.join(tempDir, `${release.repository}-${release.release_tag}.json`);
      execSync(
        `GITHUB_TOKEN=$(gh auth token) node scripts/analyze-release.js --github "${release.repository}" "${release.release_tag}" > ${outputFile} 2>/dev/null`,
        { shell: '/bin/zsh' }
      );

      const result = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      analysisResults.push(result);

      console.log(`  ✓ ${result.apis.length} APIs`);
    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}`);
    }
  }

  // Save combined results
  const analysisFile = path.join(tempDir, 'test-combined.json');
  fs.writeFileSync(analysisFile, JSON.stringify(analysisResults, null, 2));
  console.log(`\n💾 Analyzed ${analysisResults.length} releases total`);

  // Step 3: Update master metadata
  console.log('\n📝 Step 3: Updating master metadata...\n');
  execSync(`node scripts/update-master.js --mode full --input ${analysisFile}`, { stdio: 'inherit' });

  // Step 4: Generate reports
  console.log('\n📊 Step 4: Generating reports...\n');
  execSync('node scripts/generate-reports.js', { stdio: 'inherit' });

  // Step 5: Generate viewers
  console.log('\n🎨 Step 5: Generating viewers...\n');
  execSync('node scripts/generate-viewers.js', { stdio: 'inherit' });

  // Step 6: Verification
  console.log('\n✅ Step 6: Verification...\n');

  const yaml = require('js-yaml');
  const masterData = yaml.load(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'releases-master.yaml'), 'utf8')
  );

  // Check for pre-release versions
  const issues = [];
  for (const release of masterData.releases) {
    for (const api of release.apis) {
      if (api.version && api.version.includes('-rc')) {
        issues.push(`${release.repository} ${release.release_tag}: ${api.api_name} has version ${api.version}`);
      }
    }
  }

  if (issues.length > 0) {
    console.log('  ⚠️  Pre-release versions found:');
    issues.forEach(issue => console.log(`    - ${issue}`));
  } else {
    console.log('  ✓ No pre-release versions (correct!)');
  }

  console.log(`\n  Total: ${masterData.releases.length} releases`);

  console.log('\n🎉 Test completed! Check viewers/*.html');

} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}