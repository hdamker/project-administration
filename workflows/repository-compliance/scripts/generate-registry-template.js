#!/usr/bin/env node

/**
 * Repository Registry Template Generator
 *
 * Discovers all CAMARA repositories via GitHub API and generates an initial
 * repository-registry.yaml template with auto-categorization based on topics.
 *
 * Usage:
 *   node scripts/generate-registry-template.js [--output config/repository-registry.yaml]
 */

const fs = require('fs');
const yaml = require('js-yaml');
const { Octokit } = require('@octokit/rest');

// Configuration
const GITHUB_ORG = process.env.GITHUB_ORG || 'camaraproject';
const DEFAULT_OUTPUT_PATH = 'config/repository-registry.yaml';

// Initialize GitHub API client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

/**
 * Categorize repository based on topics
 */
function categorizeRepository(repo) {
  const topics = repo.topics || [];

  // API repositories
  if (topics.includes('graduated-api-repository')) {
    return 'api-graduated';
  }
  if (topics.includes('incubating-api-repository')) {
    return 'api-incubating';
  }
  if (topics.includes('sandbox-api-repository')) {
    return 'api-sandbox';
  }

  // Working group repositories
  if (topics.includes('working-group')) {
    return 'working-group';
  }

  // Archived repositories
  if (repo.archived) {
    return 'archived';
  }

  // Project infrastructure (common naming patterns)
  const infraNames = ['project-administration', 'tooling', 'governance', 'template'];
  if (infraNames.some(name => repo.name.toLowerCase().includes(name))) {
    return 'project-infrastructure';
  }

  // Marketing repositories
  const marketingNames = ['marketing', 'branding', 'website'];
  if (marketingNames.some(name => repo.name.toLowerCase().includes(name))) {
    return 'marketing';
  }

  // Default to out-of-scope for manual review
  return 'out-of-scope';
}

/**
 * Determine default required maintainers based on category
 */
function getRequiredMaintainers(category) {
  const defaults = {
    'api-graduated': 3,
    'api-incubating': 2,
    'api-sandbox': 1,
    'working-group': 2,
    'project-infrastructure': 2,
    'marketing': 1,
    'archived': 0,
    'out-of-scope': null
  };
  return defaults[category] || null;
}

/**
 * Determine if branch protection is required based on category
 */
function getBranchProtectionRequired(category) {
  const requireProtection = [
    'api-graduated',
    'api-incubating',
    'working-group',
    'project-infrastructure'
  ];
  return requireProtection.includes(category);
}

/**
 * Fetch all repositories from GitHub
 */
async function fetchAllRepositories() {
  console.error(`Fetching repositories from ${GITHUB_ORG}...`);

  const repos = [];
  let page = 1;

  while (true) {
    const { data } = await octokit.repos.listForOrg({
      org: GITHUB_ORG,
      type: 'all', // Include both public and private
      per_page: 100,
      page: page
    });

    if (data.length === 0) break;

    repos.push(...data);
    page++;
  }

  console.error(`Found ${repos.length} repositories`);
  return repos;
}

/**
 * Generate repository registry template
 */
async function generateRegistryTemplate(outputPath) {
  try {
    // Fetch all repositories
    const repos = await fetchAllRepositories();

    // Categorize and prepare registry entries
    const registryEntries = repos
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(repo => {
        const category = categorizeRepository(repo);
        const entry = {
          name: repo.name,
          category: category
        };

        // Add optional fields only if they have meaningful values
        const requiredMaintainers = getRequiredMaintainers(category);
        if (requiredMaintainers !== null && requiredMaintainers > 0) {
          entry.required_maintainers = requiredMaintainers;
        }

        const branchProtectionRequired = getBranchProtectionRequired(category);
        if (branchProtectionRequired) {
          entry.branch_protection_required = true;
        }

        // Add note for out-of-scope repositories
        if (category === 'out-of-scope') {
          entry.notes = 'Requires manual categorization';
        }

        // Add note for archived repositories
        if (category === 'archived') {
          entry.notes = 'Repository is archived';
        }

        return entry;
      });

    // Generate statistics
    const stats = {};
    registryEntries.forEach(entry => {
      stats[entry.category] = (stats[entry.category] || 0) + 1;
    });

    // Create registry document
    const registry = {
      metadata: {
        version: '1.0.0',
        last_updated: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        description: 'Manual registry of CAMARA repositories (source of truth for compliance expectations)'
      },
      repositories: registryEntries
    };

    // Write to file
    const yamlContent = yaml.dump(registry, {
      lineWidth: -1, // No line wrapping
      noRefs: true,
      sortKeys: false
    });

    fs.writeFileSync(outputPath, yamlContent, 'utf8');

    // Output statistics
    console.error('\nRegistry template generated successfully:');
    console.error(`  Output: ${outputPath}`);
    console.error(`  Total repositories: ${registryEntries.length}`);
    console.error('\nCategory breakdown:');
    Object.entries(stats)
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .forEach(([category, count]) => {
        console.error(`  ${category}: ${count}`);
      });

    // Warn about out-of-scope repositories
    const outOfScopeCount = stats['out-of-scope'] || 0;
    if (outOfScopeCount > 0) {
      console.error(`\nWARNING: ${outOfScopeCount} repositories categorized as "out-of-scope" - manual review required`);
    }

    console.log(JSON.stringify({ success: true, repository_count: registryEntries.length }));

  } catch (error) {
    console.error('Error generating registry template:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const outputPath = outputIndex >= 0 && args[outputIndex + 1]
  ? args[outputIndex + 1]
  : DEFAULT_OUTPUT_PATH;

// Run the generator
generateRegistryTemplate(outputPath);
