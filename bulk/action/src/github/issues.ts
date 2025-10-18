import { Octokit } from "@octokit/rest";
export async function createIssue(octokit: Octokit, params: { owner:string, repo:string, title:string, body:string, labels?:string[] }) {
  const res = await octokit.issues.create({ owner: params.owner, repo: params.repo, title: params.title, body: params.body, labels: params.labels });
  return res.data.html_url!;
}
