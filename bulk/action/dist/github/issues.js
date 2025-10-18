export async function createOrUpdateIssue(octokit, params) {
    // Search for existing open issue with same title and labels
    const existing = await octokit.issues.listForRepo({
        owner: params.owner,
        repo: params.repo,
        state: "open",
        labels: params.labels?.join(",")
    });
    const match = existing.data.find(i => i.title === params.title);
    if (match) {
        // Update existing issue
        await octokit.issues.update({
            owner: params.owner,
            repo: params.repo,
            issue_number: match.number,
            body: params.body
        });
        return match.html_url;
    }
    // Create new issue
    const res = await octokit.issues.create({
        owner: params.owner,
        repo: params.repo,
        title: params.title,
        body: params.body,
        labels: params.labels
    });
    return res.data.html_url;
}
