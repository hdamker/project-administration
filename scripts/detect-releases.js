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
  console.error(`Fetching repositories from ${GITHUB_ORG}...`);

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

    // Filter for API repositories by topics
    // Topics: sandbox-api-repository, incubating-api-repository, graduated-api-repository
    const apiRepos = data.filter(repo =>
      !repo.archived &&
      (repo.topics?.includes('sandbox-api-repository') ||
       repo.topics?.includes('incubating-api-repository') ||
       repo.topics?.includes('graduated-api-repository'))
    );

    repos.push(...apiRepos);
    page++;
  }

  console.error(`Found ${repos.length} API repositories`);
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

    // Get all public releases (exclude only pre-releases and drafts)
    // No filtering by tag format - collect everything first
    const publicReleases = data.filter(release =>
      !release.prerelease &&
      !release.draft
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
  const args = process.argv.slice(2);
  let mode = 'incremental';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && i + 1 < args.length) {
      mode = args[i + 1];
      i++;
    }
  }

  console.error(`🔍 Release Detection - Mode: ${mode}`);
  console.error('================================');

  // Load existing metadata
  const masterData = loadMasterMetadata();
  console.error(`Loaded ${masterData.releases.length} existing releases`);

  // Fetch all API repositories with the specified topics
  const repositories = await fetchAPIRepositories();
  const repositoriesToCheck = repositories.map(r => r.name).sort();

  console.error(`Will check ${repositoriesToCheck.length} repositories`);

  if (mode === 'full') {
    // Full mode: analyze all repositories
    const output = {
      has_updates: true,
      repositories_to_analyze: repositoriesToCheck,
      releases_count: 0,  // Will be determined during analysis
      mode: 'full'
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Incremental mode: check for new releases
  const reposToAnalyze = new Set();
  let newReleasesCount = 0;

  // Create map of existing releases
  const existingReleases = new Map();
  for (const release of masterData.releases) {
    const key = `${release.repository}:${release.release_tag}`;
    existingReleases.set(key, true);
  }

  // Check each repository for new releases
  for (const repo of repositoriesToCheck) {
    try {
      console.error(`Checking ${repo}...`);
      const releases = await fetchReleases(repo);

      for (const release of releases) {
        const key = `${repo}:${release.tag_name}`;
        if (!existingReleases.has(key)) {
          reposToAnalyze.add(repo);
          newReleasesCount++;
        }
      }
    } catch (error) {
      console.error(`Error checking ${repo}: ${error.message}`);
    }
  }

  const output = {
    has_updates: reposToAnalyze.size > 0,
    repositories_to_analyze: Array.from(reposToAnalyze),
    releases_count: newReleasesCount,
    mode: 'incremental'
  };

  console.log(JSON.stringify(output, null, 2));
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = { loadMasterMetadata, fetchAPIRepositories, fetchReleases };