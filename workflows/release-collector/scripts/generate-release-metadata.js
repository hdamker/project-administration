#!/usr/bin/env node

/**
 * Generate Release Metadata Script
 *
 * Generates release-metadata.yaml files for legacy releases only.
 * Releases with native tag-root release-metadata.yaml are skipped.
 * Conforms to the schema at:
 * upstream/traversals/ReleaseManagement/artifacts/metadata-schemas/schemas/release-metadata-schema.yaml
 *
 * Always regenerates legacy metadata files - git diff shows what changed.
 * No modes needed - idempotent regeneration.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Paths
const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const MASTER_FILE = path.join(DATA_DIR, 'releases-master.yaml');
const ARTIFACTS_DIR = path.join(DATA_DIR, 'release-artifacts');
const GITHUB_ORG = process.env.GITHUB_ORG || 'camaraproject';

/**
 * Load the master metadata file
 * @returns {object} Master metadata with releases
 */
function loadMaster() {
  if (!fs.existsSync(MASTER_FILE)) {
    console.error(`Master file not found: ${MASTER_FILE}`);
    process.exit(1);
  }
  return yaml.load(fs.readFileSync(MASTER_FILE, 'utf8'));
}

/**
 * Check if a release tag already contains native release-metadata.yaml
 *
 * Hotfix note: this probe is intentionally local to the artifact generation
 * phase to stop redundant generated metadata quickly. The broader native
 * metadata implementation should move this classification upstream into the
 * main analysis pipeline so it is computed once and passed forward.
 *
 * @param {string} repo - Repository name
 * @param {string} tag - Release tag
 * @returns {Promise<boolean>} True if native metadata exists at tag root
 */
async function hasNativeReleaseMetadata(repo, tag) {
  const url = `https://api.github.com/repos/${GITHUB_ORG}/${repo}/contents/release-metadata.yaml?ref=${encodeURIComponent(tag)}`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'camara-release-collector'
  };

  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(url, { headers });

  if (response.status === 200) {
    return true;
  }

  if (response.status === 404) {
    return false;
  }

  const body = await response.text();
  throw new Error(`GitHub API ${response.status} while checking native metadata for ${repo}/${tag}: ${body}`);
}

/**
 * Convert master release entry to release-metadata schema format
 * @param {object} release - Release from releases-master.yaml
 * @returns {object} Release metadata conforming to upstream schema
 */
function toReleaseMetadata(release) {
  // Use schema 2.0.0 property names only (clean break)
  const apis = (release.apis || []).map(api => ({
    api_name: api.api_name,
    api_version: api.api_version,
    api_title: api.api_title || api.api_name
  }));

  return {
    repository: {
      repository_name: release.repository,
      release_tag: release.release_tag,
      release_type: release.release_type,  // Use directly from master file
      release_date: formatReleaseDate(release.release_date),
      src_commit_sha: null,  // Not available for backfill
      ...(release.repository_archived ? { repository_archived: true } : {})
    },
    apis: apis
  };
}

/**
 * Format release date to ISO 8601 UTC format
 * @param {string} dateString - Date string from release
 * @returns {string|null} Formatted date or null
 */
function formatReleaseDate(dateString) {
  if (!dateString) return null;

  try {
    const date = new Date(dateString);
    // Format: YYYY-MM-DDTHH:MM:SSZ
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  } catch (e) {
    return dateString;
  }
}

/**
 * Write release metadata files
 * @param {object} metadata - Release metadata object
 * @param {string} repo - Repository name
 * @param {string} tag - Release tag
 */
function writeMetadataFiles(metadata, repo, tag) {
  const dir = path.join(ARTIFACTS_DIR, repo, tag);

  // Create directory structure
  fs.mkdirSync(dir, { recursive: true });

  // Write YAML file
  const yamlContent = yaml.dump(metadata, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false
  });
  fs.writeFileSync(path.join(dir, 'release-metadata.yaml'), yamlContent);

}

/**
 * Process all releases
 * @returns {Promise<object>} Processing results
 */
async function processReleases() {
  const master = loadMaster();
  const releases = master.releases || [];

  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

  const results = {
    processed: 0,
    skipped_native: 0,
    errors: [],
    files: []
  };

  console.error(`Processing ${releases.length} releases...`);

  for (const release of releases) {
    const repo = release.repository;
    const tag = release.release_tag;

    try {
      const hasNative = await hasNativeReleaseMetadata(repo, tag);
      if (hasNative) {
        console.error(`Skipped native metadata for ${repo}/${tag}`);
        results.skipped_native++;
        continue;
      }

      const metadata = toReleaseMetadata(release);
      writeMetadataFiles(metadata, repo, tag);

      console.error(`Generated ${repo}/${tag}`);
      results.processed++;
      results.files.push(`${repo}/${tag}/release-metadata.yaml`);
    } catch (error) {
      console.error(`Error processing ${repo}/${tag}: ${error.message}`);
      results.errors.push({ repo, tag, error: error.message });
    }
  }

  return results;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    console.error(`
Usage: node generate-release-metadata.js

Generates release-metadata.yaml files for releases in releases-master.yaml
that do not already contain native tag-root release-metadata.yaml.
Always regenerates legacy files - git diff shows changes.

Output directory: data/release-artifacts/{repo}/{tag}/
`);
    process.exit(0);
  }

  console.error('Release Metadata Generator');
  console.error('');

  const results = await processReleases();

  // Output summary
  console.error('');
  console.error('=== Summary ===');
  console.error(`Processed: ${results.processed}`);
  console.error(`Skipped native: ${results.skipped_native}`);
  console.error(`Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.error('\nErrors:');
    results.errors.forEach(e => {
      console.error(`  ${e.repo}/${e.tag}: ${e.error}`);
    });
  }

  // Output JSON summary to stdout for workflow consumption
  console.log(JSON.stringify({
    processed: results.processed,
    skipped_native: results.skipped_native,
    errors: results.errors.length,
    files: results.files
  }, null, 2));

  // Exit with error if all releases failed
  if (results.processed === 0 && results.errors.length > 0) {
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = {
  toReleaseMetadata,
  hasNativeReleaseMetadata,
  processReleases,
  loadMaster,
  formatReleaseDate
};
