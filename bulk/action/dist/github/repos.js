export async function searchRepos(octokit, query) {
    const out = [];
    const per_page = 50;
    let page = 1;
    while (true) {
        const res = await octokit.search.repos({ q: query, per_page, page, sort: "updated", order: "desc" });
        out.push(...res.data.items.map(i => ({ owner: i.owner.login, name: i.name, default_branch: i.default_branch })));
        if (res.data.items.length < per_page)
            break;
        page++;
    }
    return out;
}
