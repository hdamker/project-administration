import { exec as _exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import * as core from "@actions/core";
const exec = promisify(_exec);
export async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}
export async function run(cmd, cwd) {
    const { stdout, stderr } = await exec(cmd, { cwd, env: { ...process.env, GIT_ASKPASS: "echo" } });
    return { stdout, stderr };
}
export async function cloneShallow(repoFull, tmpRoot, defaultBranch) {
    const url = `https://github.com/${repoFull}.git`;
    const target = path.join(tmpRoot, repoFull.replace("/", "__"));
    await ensureDir(target);
    await run(`git init`, target);
    await run(`git remote add origin ${url}`, target);
    await run(`git fetch --depth 1 origin ${defaultBranch}`, target);
    await run(`git checkout -B ${defaultBranch} origin/${defaultBranch}`, target);
    return target;
}
export async function createBranch(cwd, branch) {
    await run(`git checkout -B ${branch}`, cwd);
}
export async function hasChanges(cwd) {
    const { stdout } = await run(`git status --porcelain`, cwd);
    core.info(`📊 git status --porcelain output (${stdout.length} chars):`);
    if (stdout.trim()) {
        core.info(stdout);
    }
    else {
        core.info("(empty - no changes)");
    }
    return stdout.trim().length > 0;
}
export async function hasMeaningfulChanges(cwd) {
    const { stdout } = await run("git status --porcelain", cwd);
    if (!stdout.trim())
        return false;
    // Check if changes are more than just whitespace
    core.info(`📊 Running git diff to check for meaningful changes...`);
    const { stdout: diffOutput } = await run("git diff --ignore-cr-at-eol --ignore-space-at-eol --ignore-blank-lines --ignore-all-space", cwd);
    core.info(`📊 git diff output (${diffOutput.length} chars):`);
    if (diffOutput.trim()) {
        core.info(diffOutput.substring(0, 500)); // Show first 500 chars
        if (diffOutput.length > 500) {
            core.info(`... (${diffOutput.length - 500} more chars)`);
        }
    }
    else {
        core.info("(empty - whitespace-only changes)");
    }
    return Boolean(diffOutput.trim());
}
export async function commitAll(cwd, message, cfg) {
    await run("git add -A", cwd);
    // Use single quotes for message to avoid quote escaping issues
    const escapedMsg = message.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
    await run(`git -c user.name="${cfg.userName}" -c user.email="${cfg.userEmail}" commit -s -m '${escapedMsg}' || true`, cwd);
}
export async function push(cwd, branch, token, repoFull) {
    // Use modern x-access-token format for HTTPS push auth
    const url = `https://x-access-token:${token}@github.com/${repoFull}.git`;
    await run(`git push -u "${url}" ${branch}`, cwd);
}
