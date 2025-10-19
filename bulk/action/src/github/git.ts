import { exec as _exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
const exec = promisify(_exec);

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function run(cmd: string, cwd?: string) {
  const { stdout, stderr } = await exec(cmd, { cwd, env: { ...process.env, GIT_ASKPASS: "echo" } });
  return { stdout, stderr };
}

export type GitConfig = { userName: string; userEmail: string };

export async function cloneShallow(repoFull: string, tmpRoot: string, defaultBranch: string) {
  const url = `https://github.com/${repoFull}.git`;
  const target = path.join(tmpRoot, repoFull.replace("/", "__"));
  await ensureDir(target);
  await run(`git init`, target);
  await run(`git remote add origin ${url}`, target);
  await run(`git fetch --depth 1 origin ${defaultBranch}`, target);
  await run(`git checkout -B ${defaultBranch} origin/${defaultBranch}`, target);
  return target;
}

export async function createBranch(cwd: string, branch: string) {
  await run(`git checkout -B ${branch}`, cwd);
}

export async function hasChanges(cwd: string) {
  const { stdout } = await run(`git status --porcelain`, cwd);
  return stdout.trim().length > 0;
}

export async function hasMeaningfulChanges(cwd: string) {
  const { stdout } = await run("git status --porcelain", cwd);
  if (!stdout.trim()) return false;

  // Check if changes are more than just whitespace
  const { stdout: diffOutput } = await run(
    "git diff --ignore-cr-at-eol --ignore-space-at-eol --ignore-blank-lines --ignore-all-space",
    cwd
  );
  return Boolean(diffOutput.trim());
}

export async function commitAll(cwd: string, message: string, cfg: GitConfig) {
  await run("git add -A", cwd);
  // Use single quotes for message to avoid quote escaping issues
  const escapedMsg = message.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
  await run(`git -c user.name="${cfg.userName}" -c user.email="${cfg.userEmail}" commit -s -m '${escapedMsg}' || true`, cwd);
}

export async function push(cwd: string, branch: string, token: string, repoFull: string) {
  // Use modern x-access-token format for HTTPS push auth
  const url = `https://x-access-token:${token}@github.com/${repoFull}.git`;
  await run(`git push -u "${url}" ${branch}`, cwd);
}
