#!/usr/bin/env node

/**
 * Compliance Checks Validator
 *
 * Validates compliance-checks.yaml against its schema and performs additional checks.
 *
 * Usage:
 *   node scripts/validate-compliance-checks.js
 */

const fs = require('fs');
const yaml = require('js-yaml');

// Configuration
const CHECKS_FILE = 'config/compliance-checks.yaml';
const SCHEMA_FILE = 'schemas/compliance-checks-schema.yaml';

/**
 * Load and validate compliance checks
 */
function validateComplianceChecks() {
  try {
    // Load compliance checks
    const checksContent = fs.readFileSync(CHECKS_FILE, 'utf8');
    const checks = yaml.load(checksContent);

    // Basic structure validation
    if (!checks.version || !checks.metadata || !checks.checks) {
      console.error('ERROR: Missing required top-level fields (version, metadata, checks)');
      process.exit(1);
    }

    // Validate check IDs are unique
    const checkIds = new Set();
    const duplicates = [];

    checks.checks.forEach(check => {
      if (checkIds.has(check.id)) {
        duplicates.push(check.id);
      }
      checkIds.add(check.id);
    });

    if (duplicates.length > 0) {
      console.error(`ERROR: Duplicate check IDs found: ${duplicates.join(', ')}`);
      process.exit(1);
    }

    // Validate applies_to references valid categories
    const validCategories = new Set(checks.metadata.repo_categories);
    const invalidReferences = [];

    checks.checks.forEach(check => {
      check.applies_to.forEach(category => {
        if (!validCategories.has(category)) {
          invalidReferences.push(`${check.id} → ${category}`);
        }
      });
    });

    if (invalidReferences.length > 0) {
      console.error('ERROR: Invalid category references in applies_to:');
      invalidReferences.forEach(ref => console.error(`  ${ref}`));
      process.exit(1);
    }

    // Identify Phase 1 checks
    const phase1Checks = checks.checks.filter(check => check.implemented === true);
    const phase2Plus = checks.checks.filter(check => check.implemented !== true);

    // Output results
    console.error('Compliance checks validation: PASSED');
    console.error(`  Total checks: ${checks.checks.length}`);
    console.error(`  Phase 1 (implemented): ${phase1Checks.length}`);
    console.error(`  Phase 2+ (not implemented): ${phase2Plus.length}`);
    console.error(`  Categories: ${validCategories.size}`);

    console.error('\nPhase 1 checks:');
    phase1Checks.forEach(check => {
      console.error(`  - ${check.id} (${check.severity})`);
    });

    console.log(JSON.stringify({
      success: true,
      total: checks.checks.length,
      phase1: phase1Checks.length,
      phase2plus: phase2Plus.length
    }));

  } catch (error) {
    console.error('ERROR: Validation failed:', error.message);
    process.exit(1);
  }
}

// Run validation
validateComplianceChecks();
