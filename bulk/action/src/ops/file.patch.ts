import { OpContext, Repo, PlanResult, ApplyResult } from "../sdk/context.js";
import { NeedsWorktreeError } from "../sdk/errors.js";
import fg from "fast-glob";
import * as core from "@actions/core";

export const op = {
  id: "file.patch@v1",
  describe: (inputs: any) => `Patch files with simple replace`,

  async plan(ctx: OpContext, repo: Repo): Promise<PlanResult> {
    // Require worktree for file operations
    if (!ctx.workdir) {
      throw new NeedsWorktreeError("file.patch@v1 requires git worktree");
    }

    const globs: string[] = ctx.inputs.globs ?? [];
    const replaces: {from: string; to: string}[] = ctx.inputs.replace ?? [];

    core.info(`🔍 file.patch@v1: Searching in workdir: ${ctx.workdir}`);
    core.info(`🔍 file.patch@v1: Glob patterns: ${globs.join(", ")}`);
    core.info(`🔍 file.patch@v1: Replace rules: ${replaces.map(r => `"${r.from}" → "${r.to}"`).join(", ")}`);

    // Expand glob patterns to actual file paths
    const files = await fg(globs, { cwd: ctx.workdir, dot: true, absolute: false });
    core.info(`📁 file.patch@v1: Found ${files.length} files: ${files.join(", ")}`);

    let changedCount = 0;
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
          // WRITE TO DISK during plan() to enable git diff
          await ctx.fs.writeText(file, after);
          changedCount++;
        } else {
          core.info(`⏭️  file.patch@v1: File ${file} UNCHANGED`);
        }
      } catch (e) {
        core.warning(`⚠️  file.patch@v1: Could not read ${file}: ${e}`);
      }
    }

    core.info(`✅ file.patch@v1: Total changes: ${changedCount}`);
    return {
      outcome: changedCount > 0 ? "would_apply" : "noop",
      details: { changedFiles: changedCount }
    };
  },

  async apply(ctx: OpContext, _repo: Repo, plan: PlanResult): Promise<ApplyResult> {
    // Idempotent: changes already written to disk during plan()
    if (plan.outcome === "noop") {
      return { outcome: "noop" };
    }
    return {
      outcome: "applied",
      details: plan.details
    };
  },
};
