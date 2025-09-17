#!/usr/bin/env node

/**
 * Release Analysis Script
 *
 * Analyzes releases to extract API specifications and metadata.
 * Can work in two modes:
 * - Remote: Fetch from GitHub API
 * - Local: Analyze from local git repository (for testing)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { Octokit } = require('@octokit/rest');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration
const GITHUB_ORG = process.env.GITHUB_ORG || 'camaraproject';
const CONFIG_PATH = path.join(__dirname, '..', 'config');

// Initialize GitHub API client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

/**
 * Load configuration files
 */
function loadConfig() {
  const corrections = yaml.load(
    fs.readFileSync(path.join(CONFIG_PATH, 'api-corrections.yaml'), 'utf8')
  );
  const mappings = yaml.load(
    fs.readFileSync(path.join(CONFIG_PATH, 'meta-release-mappings.yaml'), 'utf8')
  );
  return { corrections, mappings };
}

/**
 * Extract API name from file path
 * code/API_definitions/quality-on-demand.yaml -> quality-on-demand
 */
function extractAPIName(filePath) {
  const match = filePath.match(/API_definitions\/([^\/]+)\.yaml$/);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * Apply corrections to API name
 */
function correctAPIName(apiName, corrections) {
  return corrections.api_name_corrections[apiName] || apiName;
}

/**
 * Determine meta-release for a repository and release tag
 */
function getMetaRelease(repository, releaseTag, mappings) {
  // Extract release cycle from tag (rX.Y -> rX)
  const cycle = releaseTag.match(/^(r\d+)\./)?.[1];
  if (!cycle) {
    return 'Legacy';  // Not in rX.Y format
  }

  // Check each meta-release
  for (const [metaRelease, repos] of Object.entries(mappings.mappings)) {
    if (repos[repository] === cycle) {
      return metaRelease;
    }
  }

  return 'None (Sandbox)';  // rX.Y format but not mapped
}

/**
 * Analyze release from local repository (for testing)
 */
async function analyzeLocalRelease(repoPath, releaseTag) {
  console.log(`Analyzing local release: ${repoPath} @ ${releaseTag}`);

  const repoName = path.basename(repoPath);
  const config = loadConfig();

  // Checkout the release tag
  await execAsync(`git checkout ${releaseTag} --quiet`, { cwd: repoPath });

  // Find API specification files
  const apiSpecPath = path.join(repoPath, 'code', 'API_definitions');
  let apiFiles = [];

  if (fs.existsSync(apiSpecPath)) {
    apiFiles = fs.readdirSync(apiSpecPath)
      .filter(file => file.endsWith('.yaml') && !file.includes('subscription'))
      .map(file => path.join(apiSpecPath, file));
  }

  // Extract API information
  const apis = [];

  for (const apiFile of apiFiles) {
    try {
      const content = fs.readFileSync(apiFile, 'utf8');
      const spec = yaml.load(content);

      const rawApiName = extractAPIName(apiFile);
      const apiName = correctAPIName(rawApiName, config.corrections);

      if (spec && spec.info) {
        apis.push({
          name: apiName,
          version: spec.info.version || 'unknown',
          title: spec.info.title || 'Untitled',
          commonalities: spec.info['x-camara-commonalities'] || null,
          raw_name: rawApiName  // Keep original for debugging
        });
      }
    } catch (error) {
      console.error(`Error parsing ${apiFile}:`, error.message);
    }
  }

  // Get release date
  const { stdout: releaseDate } = await execAsync(
    `git log -1 --format=%aI ${releaseTag}`,
    { cwd: repoPath }
  );

  // Return back to main branch
  await execAsync('git checkout main --quiet', { cwd: repoPath });

  return {
    repository: repoName,
    release_tag: releaseTag,
    release_date: releaseDate.trim(),
    meta_release: getMetaRelease(repoName, releaseTag, config.mappings),
    github_url: `https://github.com/${GITHUB_ORG}/${repoName}/releases/tag/${releaseTag}`,
    apis: apis
  };
}

/**
 * Analyze release from GitHub API
 */
async function analyzeGitHubRelease(repository, releaseTag) {
  console.log(`Analyzing GitHub release: ${repository} @ ${releaseTag}`);

  const config = loadConfig();

  // Get release information
  const { data: release } = await octokit.repos.getReleaseByTag({
    owner: GITHUB_ORG,
    repo: repository,
    tag: releaseTag
  });

  // Get tree for the release tag
  const { data: ref } = await octokit.git.getRef({
    owner: GITHUB_ORG,
    repo: repository,
    ref: `tags/${releaseTag}`
  });

  const { data: tree } = await octokit.git.getTree({
    owner: GITHUB_ORG,
    repo: repository,
    tree_sha: ref.object.sha,
    recursive: true
  });

  // Find API specification files
  const apiFiles = tree.tree.filter(item =>
    item.path.startsWith('code/API_definitions/') &&
    item.path.endsWith('.yaml') &&
    !item.path.includes('subscription') &&
    item.type === 'blob'
  );

  // Extract API information
  const apis = [];

  for (const file of apiFiles) {
    try {
      // Get file content
      const { data: blob } = await octokit.git.getBlob({
        owner: GITHUB_ORG,
        repo: repository,
        file_sha: file.sha
      });

      // Decode base64 content
      const content = Buffer.from(blob.content, 'base64').toString('utf8');
      const spec = yaml.load(content);

      const rawApiName = extractAPIName(file.path);
      const apiName = correctAPIName(rawApiName, config.corrections);

      if (spec && spec.info) {
        apis.push({
          name: apiName,
          version: spec.info.version || 'unknown',
          title: spec.info.title || 'Untitled',
          commonalities: spec.info['x-camara-commonalities'] || null
        });
      }
    } catch (error) {
      console.error(`Error parsing ${file.path}:`, error.message);
    }
  }

  return {
    repository: repository,
    release_tag: releaseTag,
    release_date: release.published_at,
    meta_release: getMetaRelease(repository, releaseTag, config.mappings),
    github_url: release.html_url,
    apis: apis
  };
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage:');
    console.error('  Local:  node analyze-release.js --local <repo-path> <release-tag>');
    console.error('  GitHub: node analyze-release.js --github <repo-name> <release-tag>');
    console.error('');
    console.error('Examples:');
    console.error('  node analyze-release.js --local /path/to/DeviceRoamingStatus r1.1');
    console.error('  node analyze-release.js --github DeviceRoamingStatus r1.1');
    process.exit(1);
  }

  const mode = args[0];
  let result;

  try {
    if (mode === '--local') {
      const [, repoPath, releaseTag] = args;
      result = await analyzeLocalRelease(repoPath, releaseTag);
    } else if (mode === '--github') {
      const [, repoName, releaseTag] = args;
      result = await analyzeGitHubRelease(repoName, releaseTag);
    } else {
      console.error('Invalid mode. Use --local or --github');
      process.exit(1);
    }

    // Output result as JSON
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  analyzeLocalRelease,
  analyzeGitHubRelease,
  getMetaRelease,
  correctAPIName,
  extractAPIName
};