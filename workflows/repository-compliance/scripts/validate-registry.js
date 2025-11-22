#!/usr/bin/env node

/**
 * Repository Registry Validator
 *
 * Validates repository-registry.yaml against its schema and performs additional checks.
 *
 * Usage:
 *   node scripts/validate-registry.js
 */

const fs = require('fs');
const yaml = require('js-yaml');

// Configuration
const REGISTRY_FILE = 'config/repository-registry.yaml';
const CHECKS_FILE = 'config/compliance-checks.yaml';

/**
 * Load and validate repository registry
 */
function validateRegistry() {
  try {
    // Load registry
    const registryContent = fs.readFileSync(REGISTRY_FILE, 'utf8');
    const registry = yaml.load(registryContent);

    // Load compliance checks for exception validation
    const checksContent = fs.readFileSync(CHECKS_FILE, 'utf8');
    const checks = yaml.load(checksContent);
    const validCheckIds = new Set(checks.checks.map(c => c.id));
    const validCategories = new Set(checks.metadata.repo_categories);

    // Basic structure validation
    if (!registry.metadata || !registry.repositories) {
      console.error('ERROR: Missing required top-level fields (metadata, repositories)');
      process.exit(1);
    }

    // Validate repository names are unique
    const repoNames = new Set();
    const duplicates = [];

    registry.repositories.forEach(repo => {
      if (repoNames.has(repo.name)) {
        duplicates.push(repo.name);
      }
      repoNames.add(repo.name);
    });

    if (duplicates.length > 0) {
      console.error(`ERROR: Duplicate repository names: ${duplicates.join(', ')}`);
      process.exit(1);
    }

    // Validate categories
    const invalidCategories = [];
    registry.repositories.forEach(repo => {
      if (!validCategories.has(repo.category)) {
        invalidCategories.push(`${repo.name} → ${repo.category}`);
      }
    });

    if (invalidCategories.length > 0) {
      console.error('ERROR: Invalid category assignments:');
      invalidCategories.forEach(ref => console.error(`  ${ref}`));
      process.exit(1);
    }

    // Validate exception references
    const invalidExceptions = [];
    registry.repositories.forEach(repo => {
      if (repo.exceptions) {
        repo.exceptions.forEach(checkId => {
          if (!validCheckIds.has(checkId)) {
            invalidExceptions.push(`${repo.name} → ${checkId}`);
          }
        });
      }
    });

    if (invalidExceptions.length > 0) {
      console.error('ERROR: Invalid exception references:');
      invalidExceptions.forEach(ref => console.error(`  ${ref}`));
      process.exit(1);
    }

    // Generate statistics
    const stats = {};
    registry.repositories.forEach(repo => {
      stats[repo.category] = (stats[repo.category] || 0) + 1;
    });

    // Output results
    console.error('Repository registry validation: PASSED');
    console.error(`  Total repositories: ${registry.repositories.length}`);
    console.error('\nCategory breakdown:');
    Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, count]) => {
        console.error(`  ${category}: ${count}`);
      });

    const outOfScopeCount = stats['out-of-scope'] || 0;
    if (outOfScopeCount > 0) {
      console.error(`\nWARNING: ${outOfScopeCount} repositories categorized as "out-of-scope" - manual review recommended`);
    }

    console.log(JSON.stringify({
      success: true,
      total: registry.repositories.length,
      categories: Object.keys(stats).length
    }));

  } catch (error) {
    console.error('ERROR: Validation failed:', error.message);
    process.exit(1);
  }
}

// Run validation
validateRegistry();
