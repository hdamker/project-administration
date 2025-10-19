import { Octokit } from "@octokit/rest";

export async function createOrUpdateIssue(octokit: Octokit, params: { owner:string, repo:string, title:string, body:string, labels?:string[] }) {
  // Search ALL open issues by title (no label filter for better idempotency)
  const existing = await octokit.issues.listForRepo({
    owner: params.owner,
    repo: params.repo,
    state: "open",
    per_page: 100
  });

  // Find by exact title match (trimmed for robustness)
  const match = existing.data.find(i => i.title.trim() === params.title.trim());

  if (match) {
    // Update existing issue
    await octokit.issues.update({
      owner: params.owner,
      repo: params.repo,
      issue_number: match.number,
      title: params.title,
      body: params.body
    });
    // Update labels separately to ensure they're always current
    if (params.labels?.length) {
      await octokit.issues.setLabels({
        owner: params.owner,
        repo: params.repo,
        issue_number: match.number,
        labels: params.labels
      });
    }
    return match.html_url!;
  }

  // Create new issue
  const res = await octokit.issues.create({
    owner: params.owner,
    repo: params.repo,
    title: params.title,
    body: params.body,
    labels: params.labels
  });
  return res.data.html_url!;
}
