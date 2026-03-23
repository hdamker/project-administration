#!/usr/bin/env node

/**
 * Test: persisted pre-release heuristic classification
 *
 * Reproduces the ConsentInfo r2.3 misclassification bug:
 * When existing pre-releases are loaded from releases-master.yaml (no is_prerelease
 * field), the heuristic must still correctly identify them as pre-releases via
 * release_type (not the transient is_prerelease field).
 *
 * Related: IMP-084, PA#161
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const MASTER_FILE = path.join(REPO_ROOT, 'data', 'releases-master.yaml');
const TEMP_DIR = path.join(__dirname, '..', 'temp');

let originalMaster = null;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

function setup() {
  // Back up existing master
  if (fs.existsSync(MASTER_FILE)) {
    originalMaster = fs.readFileSync(MASTER_FILE, 'utf8');
  }

  // Seed master with existing pre-releases — no is_prerelease field (simulates
  // persisted state from a previous collector run)
  const seededMaster = {
    metadata: {
      last_updated: '2026-03-01T00:00:00Z',
      workflow_version: '3.0.0',
      schema_version: '2.0.0'
    },
    releases: [
      {
        repository: 'ConsentInfo',
        release_tag: 'r2.1',
        release_date: '2026-01-15T10:00:00Z',
        meta_release: 'Spring26',
        github_url: 'https://github.com/camaraproject/ConsentInfo/releases/tag/r2.1',
        release_type: 'pre-release-alpha',
        // NOTE: no is_prerelease field — this is the bug trigger
        apis: [
          {
            api_name: 'consent-info',

            api_version: '0.2.0-alpha.1',
            api_title: 'Consent Info',
            commonalities: '0.5'
          }
        ]
      },
      {
        repository: 'ConsentInfo',
        release_tag: 'r2.2',
        release_date: '2026-02-10T14:00:00Z',
        meta_release: 'Spring26',
        github_url: 'https://github.com/camaraproject/ConsentInfo/releases/tag/r2.2',
        release_type: 'pre-release-rc',
        // NOTE: no is_prerelease field
        apis: [
          {
            api_name: 'consent-info',

            api_version: '0.2.0-rc.1',
            api_title: 'Consent Info',
            commonalities: '0.5'
          }
        ]
      }
    ],
    repositories: []
  };

  fs.writeFileSync(MASTER_FILE, yaml.dump(seededMaster, { lineWidth: -1 }));
  console.log('Seeded releases-master.yaml with ConsentInfo r2.1 (alpha) and r2.2 (rc)');
  console.log('  (no is_prerelease field — simulates persisted state)\n');
}

function teardown() {
  // Restore original master
  if (originalMaster !== null) {
    fs.writeFileSync(MASTER_FILE, originalMaster);
    console.log('\nRestored original releases-master.yaml');
  }

  // Clean up temp files
  const testFile = path.join(TEMP_DIR, 'test-prerelease-analysis.json');
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
}

function runTest() {
  // New analysis result: ConsentInfo r2.3 as a non-prerelease
  const analysisResults = [
    {
      repository: 'ConsentInfo',
      release_tag: 'r2.3',
      release_date: '2026-03-15T16:00:00Z',
      github_url: 'https://github.com/camaraproject/ConsentInfo/releases/tag/r2.3',
      is_prerelease: false,
      release_type: null,  // Non-prerelease: type determined by heuristic in update-master.js
      src_commit_sha: null,
      dependencies: null,
      native_metadata: false,
      apis: [
        {
          api_name: 'consent-info',
          api_version: '0.2.0',
          api_title: 'Consent Info',
          commonalities: '0.5'
        }
      ]
    }
  ];

  // Write analysis results
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  const testFile = path.join(TEMP_DIR, 'test-prerelease-analysis.json');
  fs.writeFileSync(testFile, JSON.stringify(analysisResults, null, 2));

  // Run update-master.js in INCREMENTAL mode (merges with existing master)
  console.log('Running update-master.js in incremental mode...\n');
  try {
    const output = execSync(
      `node ${path.join(__dirname, '..', 'update-master.js')} --mode incremental --input ${testFile}`,
      { encoding: 'utf8' }
    );
    console.log(output);
  } catch (error) {
    console.error('Error running update-master:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    teardown();
    process.exit(1);
  }

  // Read updated master and validate
  const updatedMaster = yaml.load(fs.readFileSync(MASTER_FILE, 'utf8'));

  console.log('\n--- Validation ---\n');

  // Find releases by tag
  const r23 = updatedMaster.releases.find(r => r.repository === 'ConsentInfo' && r.release_tag === 'r2.3');
  const r21 = updatedMaster.releases.find(r => r.repository === 'ConsentInfo' && r.release_tag === 'r2.1');
  const r22 = updatedMaster.releases.find(r => r.repository === 'ConsentInfo' && r.release_tag === 'r2.2');

  // Test 1: r2.3 should be classified as public-release (not maintenance-release)
  assert(r23 !== undefined, 'r2.3 exists in master');
  assert(r23?.release_type === 'public-release',
    `r2.3 release_type = "${r23?.release_type}" (expected "public-release")`);

  // Test 2: r2.1 and r2.2 should be marked as superseded
  assert(r21?.superseded === true,
    `r2.1 superseded = ${r21?.superseded} (expected true)`);
  assert(r22?.superseded === true,
    `r2.2 superseded = ${r22?.superseded} (expected true)`);

  // Test 3: r2.1 and r2.2 should retain their original release_type
  assert(r21?.release_type === 'pre-release-alpha',
    `r2.1 release_type = "${r21?.release_type}" (expected "pre-release-alpha")`);
  assert(r22?.release_type === 'pre-release-rc',
    `r2.2 release_type = "${r22?.release_type}" (expected "pre-release-rc")`);

  // Test 4: Total releases should be 3
  const consentReleases = updatedMaster.releases.filter(r => r.repository === 'ConsentInfo');
  assert(consentReleases.length === 3,
    `ConsentInfo release count = ${consentReleases.length} (expected 3)`);

  // Test 5: file_name should NOT be present in any API entry (ADR-0004 Decision 6)
  const hasFileName = updatedMaster.releases.some(r =>
    r.apis.some(api => 'file_name' in api)
  );
  assert(!hasFileName, 'No API entry has file_name (removed per ADR-0004)');
}

function runNativeMetadataTest() {
  console.log('\n--- Test: Native Metadata Pass-Through ---\n');

  // Seed master empty
  const emptyMaster = {
    metadata: {
      last_updated: '2026-03-01T00:00:00Z',
      workflow_version: '3.0.0',
      schema_version: '2.0.0'
    },
    releases: [],
    repositories: []
  };
  fs.writeFileSync(MASTER_FILE, yaml.dump(emptyMaster, { lineWidth: -1 }));

  // Simulate analysis result from native metadata path
  const analysisResults = [
    {
      repository: 'ConsentInfo',
      release_tag: 'r2.3',
      release_date: '2026-03-15T16:00:00Z',
      github_url: 'https://github.com/camaraproject/ConsentInfo/releases/tag/r2.3',
      is_prerelease: false,
      release_type: 'public-release',  // Set by native metadata (not heuristic)
      src_commit_sha: 'abc123def456abc123def456abc123def456abc1',
      dependencies: {
        commonalities_release: 'r4.3 (1.3.0)',
        identity_consent_management_release: 'r4.3 (1.1.0)'
      },
      native_metadata: true,
      apis: [
        {
          api_name: 'consent-info',
          api_version: '0.2.0',
          api_title: 'Consent Info',
          commonalities: '1.3.0'  // Derived from dependencies.commonalities_release
        }
      ]
    }
  ];

  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  const testFile = path.join(TEMP_DIR, 'test-prerelease-analysis.json');
  fs.writeFileSync(testFile, JSON.stringify(analysisResults, null, 2));

  console.log('Running update-master.js with native metadata result...\n');
  try {
    const output = execSync(
      `node ${path.join(__dirname, '..', 'update-master.js')} --mode incremental --input ${testFile}`,
      { encoding: 'utf8' }
    );
    console.log(output);
  } catch (error) {
    console.error('Error running update-master:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    return;
  }

  const updatedMaster = yaml.load(fs.readFileSync(MASTER_FILE, 'utf8'));

  console.log('\n--- Validation ---\n');

  const r23 = updatedMaster.releases.find(r => r.repository === 'ConsentInfo' && r.release_tag === 'r2.3');

  assert(r23 !== undefined, 'r2.3 exists in master');
  assert(r23?.release_type === 'public-release',
    `r2.3 release_type = "${r23?.release_type}" (expected "public-release")`);
  assert(r23?.src_commit_sha === 'abc123def456abc123def456abc123def456abc1',
    `r2.3 src_commit_sha present (expected 40-char SHA)`);
  assert(r23?.dependencies?.commonalities_release === 'r4.3 (1.3.0)',
    `r2.3 dependencies.commonalities_release = "${r23?.dependencies?.commonalities_release}"`);
  assert(!('file_name' in (r23?.apis?.[0] || {})),
    'r2.3 API has no file_name field');
  assert(r23?.apis?.[0]?.commonalities === '1.3.0',
    `r2.3 API commonalities = "${r23?.apis?.[0]?.commonalities}" (expected "1.3.0")`);
}

// Main
console.log('=== Test 1: Persisted Pre-Release Heuristic Classification ===\n');

try {
  setup();
  runTest();
} finally {
  teardown();
}

console.log('\n=== Test 2: Native Metadata Pass-Through ===');

try {
  setup();  // reuses setup for backup/restore
  runNativeMetadataTest();
} finally {
  teardown();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
