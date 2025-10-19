import fs from "node:fs/promises";
export class PlanReporter {
    constructor(path) {
        this.path = path;
    }
    async writeHeader(playbookPath, playbook, repoCount, planOnly) {
        const mode = planOnly ? "PLAN (dry-run)" : "APPLY";
        const content = `# Bulk Orchestrator ${mode}\n\n` +
            `- **Playbook**: ${playbookPath}\n` +
            `- **Playbook Version**: ${playbook.version}\n` +
            `- **Repositories**: ${repoCount}\n` +
            `- **Concurrency**: ${playbook.strategy.concurrency}\n` +
            `- **Mode**: ${playbook.strategy.mode}\n` +
            `- **Fail-Fast**: ${playbook.strategy.failFast ?? false}\n\n` +
            `## Operations\n\n` +
            `${playbook.ops.map(o => `- \`${o.use}\``).join("\n")}\n\n` +
            `## Results\n\n`;
        await fs.writeFile(this.path, content);
    }
    async addRepo(repo, status, notes, prUrl, issueUrl, changeStatus) {
        const emoji = status === "ok" ? "✅" : status === "skipped" ? "⏭️" : "❌";
        // Build detailed status message
        let statusMsg = status;
        if (status === "ok" && changeStatus) {
            statusMsg = `ok (${changeStatus})`;
        }
        let line = `${emoji} **${repo.fullName}** - ${statusMsg}`;
        if (prUrl)
            line += ` | [PR](${prUrl})`;
        if (issueUrl)
            line += ` | [Issue](${issueUrl})`;
        if (notes)
            line += `\n  > ${notes}`;
        line += "\n";
        await fs.appendFile(this.path, line);
    }
    async finalize(totalRepos, failedCount, skippedCount) {
        const successCount = totalRepos - failedCount - skippedCount;
        const summary = `\n## Summary\n\n` +
            `- **Total**: ${totalRepos}\n` +
            `- **Success**: ${successCount}\n` +
            `- **Failed**: ${failedCount}\n` +
            `- **Skipped**: ${skippedCount}\n`;
        await fs.appendFile(this.path, summary);
    }
}
