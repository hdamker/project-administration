import { OpContext, Repo, PlanResult, PlanChange } from "../sdk/context";
import fg from "fast-glob";

export const op = {
  id: "file.patch@v1",
  describe: (_: any) => `Patch files`,
  guards: { skipArchived: true },
  async plan(ctx: OpContext, repo: Repo): Promise<PlanResult> {
    const step = ctx.playbook.ops.find(o => o.use === "file.patch@v1");
    const globs: string[] = step?.with?.globs ?? [];
    const replaces: {from:string, to:string}[] = step?.with?.replace ?? [];
    const changes: PlanChange[] = [];

    // Expand glob patterns to actual file paths
    const files = await fg(globs, { cwd: ctx.workdir, dot: true, absolute: false });

    for (const file of files) {
      try {
        const before = await ctx.fs.readText(file);
        let after = before;
        for (const r of replaces) {
          after = after.split(r.from).join(r.to);
        }
        if (after !== before) {
          changes.push({ path: file, before, after });
        }
      } catch (e) {
        // File not readable, skip silently
      }
    }

    ctx.report.row({ repo: repo.fullName, op: "file.patch@v1", changed: changes.length });
    return { changes };
  },
  async apply(ctx: OpContext, _repo: Repo, plan: PlanResult) {
    for (const c of plan.changes || []) await ctx.fs.writeText(c.path, c.after!);
  },
};
