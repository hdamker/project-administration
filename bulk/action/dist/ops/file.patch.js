import fg from "fast-glob";
import * as core from "@actions/core";
export const op = {
    id: "file.patch@v1",
    describe: (_) => `Patch files`,
    guards: { skipArchived: true },
    async plan(ctx, repo) {
        const step = ctx.playbook.ops.find(o => o.use === "file.patch@v1");
        const globs = step?.with?.globs ?? [];
        const replaces = step?.with?.replace ?? [];
        const changes = [];
        core.info(`🔍 file.patch@v1: Searching in workdir: ${ctx.workdir}`);
        core.info(`🔍 file.patch@v1: Glob patterns: ${globs.join(", ")}`);
        core.info(`🔍 file.patch@v1: Replace rules: ${replaces.map(r => `"${r.from}" → "${r.to}"`).join(", ")}`);
        // Expand glob patterns to actual file paths
        const files = await fg(globs, { cwd: ctx.workdir, dot: true, absolute: false });
        core.info(`📁 file.patch@v1: Found ${files.length} files: ${files.join(", ")}`);
        for (const file of files) {
            try {
                const before = await ctx.fs.readText(file);
                core.info(`📄 file.patch@v1: Processing ${file} (${before.length} bytes)`);
                core.info(`📄 file.patch@v1: First 200 chars: ${before.substring(0, 200).replace(/\n/g, "\\n")}`);
                let after = before;
                for (const r of replaces) {
                    const beforeReplace = after;
                    after = after.split(r.from).join(r.to);
                    const occurrences = (beforeReplace.length - after.length) / (r.from.length - r.to.length);
                    core.info(`🔎 file.patch@v1: Pattern "${r.from}" found ${occurrences} times in ${file}`);
                }
                if (after !== before) {
                    core.info(`✏️  file.patch@v1: File ${file} MODIFIED (${after.length} bytes after changes)`);
                    changes.push({ path: file, before, after });
                }
                else {
                    core.info(`⏭️  file.patch@v1: File ${file} UNCHANGED`);
                }
            }
            catch (e) {
                core.warning(`⚠️  file.patch@v1: Could not read ${file}: ${e}`);
            }
        }
        core.info(`✅ file.patch@v1: Total changes: ${changes.length}`);
        ctx.report.row({ repo: repo.fullName, op: "file.patch@v1", changed: changes.length });
        return { changes };
    },
    async apply(ctx, _repo, plan) {
        for (const c of plan.changes || [])
            await ctx.fs.writeText(c.path, c.after);
    },
};
