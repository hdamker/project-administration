import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as semver from 'semver';

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
  meta_release: string;
  github_url: string;
  apis: API[];
}

interface ReleasesData {
  metadata?: any;
  releases: Release[];
}

(async () => {
  try {
    const releasesFile = getInput('releases_file');
    const repoSlug = getInput('repo_slug');

    if (!releasesFile || !repoSlug) {
      throw new Error('Missing required inputs: releases_file and repo_slug');
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
      throw new Error(`No releases found for repository: ${repoName}`);
    }

    // Filter out sandbox releases (meta_release contains "Sandbox" or "None")
    const publicReleases = repoReleases.filter(
      (r: Release) =>
        r.meta_release &&
        r.meta_release !== 'None (Sandbox)' &&
        !r.meta_release.includes('Sandbox')
    );

    if (publicReleases.length === 0) {
      warning(`No public releases found for ${repoName}, only sandbox releases exist`);
      throw new Error(`No public releases available for ${repoName}`);
    }

    // Sort by semver (release_tag format: "r3.2" → "3.2")
    // Handle both "rX.Y" and other formats
    publicReleases.sort((a, b) => {
      try {
        const aVer = a.release_tag.startsWith('r')
          ? a.release_tag.substring(1)
          : a.release_tag;
        const bVer = b.release_tag.startsWith('r')
          ? b.release_tag.substring(1)
          : b.release_tag;

        // Ensure valid semver (may need to add .0 if only major.minor)
        const aVersions = aVer.split('.');
        const bVersions = bVer.split('.');
        const aSemver = aVersions.length === 2 ? `${aVer}.0` : aVer;
        const bSemver = bVersions.length === 2 ? `${bVer}.0` : bVer;

        return semver.compare(bSemver, aSemver); // Descending order
      } catch (err) {
        // Fallback to string comparison if semver fails
        return b.release_tag.localeCompare(a.release_tag);
      }
    });

    const latest = publicReleases[0];

    // Build payload with all required fields
    const payload = {
      repo_name: repoName,
      latest_public_release: latest.release_tag,
      release_date: latest.release_date,
      meta_release: latest.meta_release,
      github_url: latest.github_url,
      apis: latest.apis.map(api => ({
        api_name: api.api_name,
        file_name: api.file_name,
        version: api.version,
        title: api.title,
        commonalities: api.commonalities
      }))
    };

    // Output full JSON for Mustache templating
    setOutput('json', JSON.stringify(payload));

    // Output summary for plan reporting
    setOutput('summary', JSON.stringify({
      latest_public_release: latest.release_tag,
      api_count: latest.apis.length
    }));

    info(`Found latest public release: ${latest.release_tag} with ${latest.apis.length} APIs`);

  } catch (err: any) {
    setFailed(err.message);
  }
})();
