#!/usr/bin/env node

/**
 * Release Detection Script
 *
 * Compares current releases in CAMARA repositories with stored master metadata
 * to determine if updates are needed.
 *
 * Modes:
 * - incremental: Detect only new releases
 * - full: Force re-analysis of all releases
 * - dry-run: Test without making changes
 */

const fs = require('fs');
const yaml = require('js-yaml');
const { Octokit } = require('@octokit/rest');

// Configuration
const GITHUB_ORG = process.env.GITHUB_ORG || 'camaraproject';
const MASTER_METADATA_PATH = 'data/releases-master.yaml';
const CONFIG_PATH = 'config';

// Initialize GitHub API client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

/**
 * Load master metadata from YAML file
 */
function loadMasterMetadata() {
  try {
    if (fs.existsSync(MASTER_METADATA_PATH)) {
      const content = fs.readFileSync(MASTER_METADATA_PATH, 'utf8');
      return yaml.load(content);
    }
  } catch (error) {
    console.error('Error loading master metadata:', error);
  }

  // Return empty structure if file doesn't exist
  return {
    metadata: {
      last_updated: null,
      last_checked: null,
      workflow_version: '3.0.0',
      schema_version: '1.0.0'
    },
    releases: []
  };
}

/**
 * Fetch all API repositories from GitHub
 */
async function fetchAPIRepositories() {
  console.log(`Fetching repositories from ${GITHUB_ORG}...`);

  const repos = [];
  let page = 1;

  while (true) {
    const { data } = await octokit.repos.listForOrg({
      org: GITHUB_ORG,
      type: 'public',
      per_page: 100,
      page: page
    });

    if (data.length === 0) break;

    // Filter for API repositories (have 'camara-api' topic or contain API definitions)
    const apiRepos = data.filter(repo =>
      !repo.archived &&
      (repo.topics?.includes('camara-api') || repo.name.match(/^[A-Z]/))
    );

    repos.push(...apiRepos);
    page++;
  }

  console.log(`Found ${repos.length} API repositories`);
  return repos;
}

/**
 * Fetch all releases for a repository
 */
async function fetchReleases(repoName) {
  const releases = [];
  let page = 1;

  while (true) {
    const { data } = await octokit.repos.listReleases({
      owner: GITHUB_ORG,
      repo: repoName,
      per_page: 100,
      page: page
    });

    if (data.length === 0) break;

    // Filter for public releases (exclude pre-releases for historical data)
    const publicReleases = data.filter(release =>
      !release.prerelease &&
      !release.draft &&
      release.tag_name.match(/^r\d+\.\d+$/)  // Format: rX.Y
    );

    releases.push(...publicReleases);
    page++;
  }

  return releases;
}

/**
 * Compare releases to find new ones
 */
function findNewReleases(currentReleases, storedReleases) {
  const storedTags = new Set(
    storedReleases.map(r => `${r.repository}:${r.release_tag}`)
  );

  const newReleases = [];

  for (const [repo, releases] of Object.entries(currentReleases)) {
    for (const release of releases) {
      const key = `${repo}:${release.tag_name}`;
      if (!storedTags.has(key)) {
        newReleases.push({
          repository: repo,
          release_tag: release.tag_name,
          release_date: release.published_at,
          github_url: release.html_url
        });
      }
    }
  }

  return newReleases;
}

/**
 * Main execution
 */
async function main() {
  const mode = process.argv[2] || 'incremental';

  console.log(`🔍 Release Detection - Mode: ${mode}`);
  console.log('================================');

  // Load existing metadata
  const masterData = loadMasterMetadata();
  console.log(`Loaded ${masterData.releases.length} existing releases`);

  // Fetch current state from GitHub
  const repositories = await fetchAPIRepositories();
  const currentReleases = {};

  for (const repo of repositories) {
    console.log(`Checking ${repo.name}...`);
    const releases = await fetchReleases(repo.name);
    if (releases.length > 0) {
      currentReleases[repo.name] = releases;
    }
  }

  // Determine what needs updating
  let hasUpdates = false;
  let releasesToAnalyze = [];

  if (mode === 'full') {
    console.log('Full analysis requested - all releases will be analyzed');
    hasUpdates = true;

    // Flatten all releases for analysis
    for (const [repo, releases] of Object.entries(currentReleases)) {
      for (const release of releases) {
        releasesToAnalyze.push({
          repository: repo,
          release_tag: release.tag_name,
          release_date: release.published_at,
          github_url: release.html_url
        });
      }
    }
  } else {
    // Find only new releases
    const newReleases = findNewReleases(currentReleases, masterData.releases);

    if (newReleases.length > 0) {
      console.log(`Found ${newReleases.length} new releases`);
      hasUpdates = true;
      releasesToAnalyze = newReleases;
    } else {
      console.log('No new releases found');
    }
  }

  // Output results for workflow
  console.log(`::set-output name=has_updates::${hasUpdates}`);
  console.log(`::set-output name=new_releases::${JSON.stringify(releasesToAnalyze)}`);
  console.log(`::set-output name=all_repos::${JSON.stringify(Object.keys(currentReleases))}`);

  // Update last checked timestamp
  masterData.metadata.last_checked = new Date().toISOString();

  // Save updated metadata (just the timestamp for incremental mode)
  if (mode !== 'dry-run') {
    fs.writeFileSync(MASTER_METADATA_PATH, yaml.dump(masterData));
  }

  console.log('✅ Detection complete');
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = { loadMasterMetadata, fetchAPIRepositories, fetchReleases };