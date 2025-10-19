import * as github from "@actions/github";
import Mustache from "mustache";
import fs from "node:fs/promises";
import path from "node:path";
export function makeCtx(octokit, token, planOnly, playbook, workdir, inputs, addRow) {
    return {
        octokit, token, planOnly, playbook, workdir, inputs,
        fs: {
            async readText(p) {
                if (!workdir)
                    throw new Error("fs.readText requires workdir");
                return fs.readFile(path.join(workdir, p), "utf-8");
            },
            async writeText(p, content) {
                if (!workdir)
                    throw new Error("fs.writeText requires workdir");
                await fs.mkdir(path.dirname(path.join(workdir, p)), { recursive: true });
                await fs.writeFile(path.join(workdir, p), content, "utf-8");
            }
        },
        async renderTemplate(source, filePath, view) {
            let tpl = source ?? "";
            if (!tpl && filePath) {
                // Resolve relative paths from workspace root, not workdir
                const resolvedPath = path.isAbsolute(filePath)
                    ? filePath
                    : path.join(process.cwd(), filePath);
                tpl = await fs.readFile(resolvedPath, "utf-8");
            }
            return Mustache.render(tpl, view ?? {});
        },
        report: { row: addRow },
        env: { actor: github.context.actor ?? "unknown", runId: github.context.runId ?? 0, runUrl: `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}` },
    };
}
