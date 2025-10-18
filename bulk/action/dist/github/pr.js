export async function createOrUpdatePR(octokit, params) {
    const existing = await octokit.pulls.list({ owner: params.owner, repo: params.repo, state: "open", head: `${params.owner}:${params.head}`, base: params.base });
    if (existing.data.length) {
        const pr = existing.data[0];
        await octokit.pulls.update({ owner: params.owner, repo: params.repo, pull_number: pr.number, title: params.title, body: params.body });
        return pr.html_url;
    }
    const pr = await octokit.pulls.create({ owner: params.owner, repo: params.repo, head: params.head, base: params.base, title: params.title, body: params.body });
    const num = pr.data.number;
    if (params.labels?.length)
        await octokit.issues.addLabels({ owner: params.owner, repo: params.repo, issue_number: num, labels: params.labels });
    if (params.reviewers?.length)
        await octokit.pulls.requestReviewers({ owner: params.owner, repo: params.repo, pull_number: num, reviewers: params.reviewers.filter(x => !x.includes("/")) });
    return pr.data.html_url;
}
