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
  version: string;
  title: string;
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

interface ReleasesData {
  metadata?: any;
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
function deriveApiStatus(version: string): string {
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
function extractBaseVersion(version: string): string {
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

    // Filter releases for this repository
    const repoReleases = doc.releases.filter(
      (r: Release) => r.repository === repoName
    );

    if (repoReleases.length === 0) {
      warning(`No releases found for repository: ${repoName}`);
      // Generate a minimal release-plan for new repos
      const newRepoPlan: ReleasePlan = {
        repository: {
          release_track: 'none',
          target_release_tag: 'r1.1',
          target_release_type: 'none'
        },
        apis: []
      };

      const yamlContent = generateYamlContent(newRepoPlan, repoName);
      fs.writeFileSync(outFile, yamlContent, 'utf8');

      const jsonPayload = {
        repo_name: repoName,
        release_track: 'none',
        target_release_tag: 'r1.1',
        target_release_type: 'none',
        api_count: 0,
        apis: []
      };

      setOutput('json', JSON.stringify(jsonPayload));
      setOutput('generated', 'true');
      info(`Generated release-plan.yaml for new repository: ${repoName}`);
      return;
    }

    // Filter out sandbox releases
    const publicReleases = repoReleases.filter(
      (r: Release) =>
        r.meta_release &&
        r.meta_release !== 'None (Sandbox)' &&
        !r.meta_release.includes('Sandbox')
    );

    if (publicReleases.length === 0) {
      warning(`No public releases found for ${repoName}, using most recent release`);
      // Use the most recent release even if sandbox
      repoReleases.sort((a, b) =>
        new Date(b.release_date).getTime() - new Date(a.release_date).getTime()
      );
    } else {
      // Sort by release_tag (descending) to get latest
      publicReleases.sort((a, b) => {
        try {
          const aVer = a.release_tag.startsWith('r') ? a.release_tag.substring(1) : a.release_tag;
          const bVer = b.release_tag.startsWith('r') ? b.release_tag.substring(1) : b.release_tag;
          return bVer.localeCompare(aVer, undefined, { numeric: true });
        } catch {
          return b.release_tag.localeCompare(a.release_tag);
        }
      });
    }

    const latest = publicReleases.length > 0 ? publicReleases[0] : repoReleases[0];

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
        target_api_version: extractBaseVersion(api.version),
        target_api_status: deriveApiStatus(api.version)
      }))
    };

    // Add meta_release if tracking meta-release
    if (releaseTrack === 'meta-release' && latest.meta_release) {
      releasePlan.repository.meta_release = latest.meta_release;
    }

    // Generate YAML content
    const yamlContent = generateYamlContent(releasePlan, repoName);
    fs.writeFileSync(outFile, yamlContent, 'utf8');

    // Output JSON for PR body template
    const jsonPayload = {
      repo_name: repoName,
      release_track: releasePlan.repository.release_track,
      meta_release: releasePlan.repository.meta_release || null,
      target_release_tag: releasePlan.repository.target_release_tag,
      target_release_type: releasePlan.repository.target_release_type,
      api_count: releasePlan.apis.length,
      apis: releasePlan.apis
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
function generateYamlContent(plan: ReleasePlan, repoName: string): string {
  let content = `# CAMARA Release Plan
# This file declares the release targets for this repository.
# Edit target_* fields to plan your next release.
#
# Repository: ${repoName}
# Generated: ${new Date().toISOString().split('T')[0]}

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
    content += `  # No APIs defined yet - add API entries when implementation begins
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
