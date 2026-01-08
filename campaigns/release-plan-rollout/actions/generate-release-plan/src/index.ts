import * as fs from 'fs';
import * as yaml from 'js-yaml';

function getInput(name: string): string {
  return process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] || '';
}

function setOutput(name: string, value: string): void {
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    fs.appendFileSync(output, `${name}=${value}\n`, 'utf8');
  } else {
    console.log(`::set-output name=${name}::${value}`);
  }
}

function setFailed(message: string): void {
  console.error(`::error::${message}`);
  process.exit(1);
}

function info(message: string): void {
  console.log(message);
}

function warning(message: string): void {
  console.log(`::warning::${message}`);
}

interface API {
  api_name: string;
  file_name: string;
  api_version: string;
  api_title: string;
  commonalities: string | null;
}

interface Release {
  repository: string;
  release_tag: string;
  release_date: string;
  release_type?: string;
  meta_release: string;
  github_url: string;
  apis: API[];
}

interface RepositoryInfo {
  repository: string;
  github_url: string;
  latest_public_release: string | null;
  newest_pre_release: string | null;
}

interface ReleasesData {
  metadata?: any;
  repositories?: RepositoryInfo[];
  releases: Release[];
}

interface ReleasePlanAPI {
  api_name: string;
  target_api_version: string;
  target_api_status: string;
}

interface ReleasePlan {
  repository: {
    release_track: string;
    meta_release?: string;
    target_release_tag: string;
    target_release_type: string;
  };
  apis: ReleasePlanAPI[];
}

/**
 * Derive API status from version string
 * - Ends with -alpha.N -> "alpha"
 * - Ends with -rc.N -> "rc"
 * - Otherwise -> "public"
 */
function deriveApiStatus(version: string | undefined | null): string {
  if (!version) {
    return 'unknown';
  }
  if (version.includes('-alpha')) {
    return 'alpha';
  }
  if (version.includes('-rc')) {
    return 'rc';
  }
  return 'public';
}

/**
 * Extract base version (remove pre-release suffixes)
 * "1.0.0-alpha.1" -> "1.0.0"
 * "1.0.0-rc.2" -> "1.0.0"
 * "1.0.0" -> "1.0.0"
 */
function extractBaseVersion(version: string | undefined | null): string {
  if (!version) {
    return 'unknown';
  }
  return version.split('-')[0];
}

/**
 * Map release_type from releases-master to target_release_type for release-plan
 * If not present, derive from meta_release
 */
function mapReleaseType(release: Release): string {
  if (release.release_type) {
    return release.release_type;
  }
  // Fallback: assume public-release for meta-release tracked releases
  if (release.meta_release && !release.meta_release.includes('Sandbox')) {
    return 'public-release';
  }
  return 'none';
}

(async () => {
  try {
    const releasesFile = getInput('releases_file');
    const repoSlug = getInput('repo_slug');
    const outFile = getInput('out_file');

    if (!releasesFile || !repoSlug || !outFile) {
      throw new Error('Missing required inputs: releases_file, repo_slug, and out_file');
    }

    const repoName = repoSlug.split('/')[1];

    if (!fs.existsSync(releasesFile)) {
      throw new Error(`Releases file not found: ${releasesFile}`);
    }

    const doc = yaml.load(fs.readFileSync(releasesFile, 'utf8')) as ReleasesData;

    if (!doc || !doc.releases) {
      throw new Error(`Invalid releases-master.yaml structure`);
    }

    // Look up repository in repositories array to determine which release to use
    const repoInfo = doc.repositories?.find(r => r.repository === repoName);
    let targetReleaseTag: string | null = null;

    if (repoInfo) {
      // Use newest_pre_release if available (it's newer), otherwise latest_public_release
      targetReleaseTag = repoInfo.newest_pre_release || repoInfo.latest_public_release;
      info(`Repository info found: newest_pre_release=${repoInfo.newest_pre_release}, latest_public_release=${repoInfo.latest_public_release}`);
    }

    // Find the target release in releases array
    let targetRelease: Release | null = null;
    if (targetReleaseTag) {
      targetRelease = doc.releases.find(
        r => r.repository === repoName && r.release_tag === targetReleaseTag
      ) || null;
    }

    // Handle repos without releases (WIP or new repos)
    if (!targetRelease) {
      warning(`No releases found for repository: ${repoName}`);
      // Generate a minimal release-plan for repos without releases
      const newRepoPlan: ReleasePlan = {
        repository: {
          release_track: 'none',
          target_release_tag: 'r1.1',
          target_release_type: 'none'
        },
        apis: []
      };

      const yamlContent = generateYamlContent(newRepoPlan, repoName, true);
      fs.writeFileSync(outFile, yamlContent, 'utf8');

      const jsonPayload = {
        target_release_tag: 'r1.1',
        target_release_type: 'none',
        apis: [] as string[],
        warning: 'no_releases',
        warning_message: 'Repository has no releases. API entries must be added manually based on code/API_definitions/*.yaml files.'
      };

      setOutput('json', JSON.stringify(jsonPayload));
      setOutput('generated', 'true');
      info(`Generated placeholder release-plan.yaml for repository without releases: ${repoName}`);
      return;
    }

    const latest = targetRelease;

    // Map to release-plan structure (status quo)
    const releaseTrack = latest.meta_release && !latest.meta_release.includes('Sandbox')
      ? 'meta-release'
      : 'independent';

    const releasePlan: ReleasePlan = {
      repository: {
        release_track: releaseTrack,
        target_release_tag: latest.release_tag,
        target_release_type: mapReleaseType(latest)
      },
      apis: latest.apis.map(api => ({
        api_name: api.api_name,
        target_api_version: extractBaseVersion(api.api_version),
        target_api_status: deriveApiStatus(api.api_version)
      }))
    };

    // Add meta_release if tracking meta-release
    if (releaseTrack === 'meta-release' && latest.meta_release) {
      releasePlan.repository.meta_release = latest.meta_release;
    }

    // Generate YAML content
    const yamlContent = generateYamlContent(releasePlan, repoName);
    fs.writeFileSync(outFile, yamlContent, 'utf8');

    // Output JSON for PR body template (reduced fields for plan summary)
    const jsonPayload = {
      target_release_tag: releasePlan.repository.target_release_tag,
      target_release_type: releasePlan.repository.target_release_type,
      apis: releasePlan.apis.map(a => a.api_name)
    };

    setOutput('json', JSON.stringify(jsonPayload));
    setOutput('generated', 'true');

    info(`Generated release-plan.yaml for ${repoName}`);
    info(`  Release tag: ${latest.release_tag}`);
    info(`  Release type: ${mapReleaseType(latest)}`);
    info(`  APIs: ${releasePlan.apis.length}`);

  } catch (err: any) {
    setOutput('generated', 'false');
    setFailed(err.message);
  }
})();

/**
 * Generate YAML content with comments
 */
function generateYamlContent(plan: ReleasePlan, repoName: string, isPlaceholder: boolean = false): string {
  let content = `# CAMARA Release Plan
# This file declares the release targets for this repository.
# Edit target_* fields to plan your next release.
#
# Repository: ${repoName}
# Generated: ${new Date().toISOString().split('T')[0]}
`;

  if (isPlaceholder) {
    content += `#
# WARNING: This is a placeholder file - no releases found for this repository.
# Please update all target_* fields and add API entries manually.
`;
  }

  content += `
repository:
  release_track: "${plan.repository.release_track}"
`;

  if (plan.repository.meta_release) {
    content += `  meta_release: "${plan.repository.meta_release}"
`;
  }

  content += `  target_release_tag: "${plan.repository.target_release_tag}"
  target_release_type: "${plan.repository.target_release_type}"

apis:
`;

  if (plan.apis.length === 0) {
    content += `  # No APIs defined yet - add API entries based on code/API_definitions/*.yaml files
  []
`;
  } else {
    for (const api of plan.apis) {
      content += `  - api_name: "${api.api_name}"
    target_api_version: "${api.target_api_version}"
    target_api_status: "${api.target_api_status}"
`;
    }
  }

  return content;
}
