import * as github from "@actions/github";
import { Octokit } from "@octokit/rest";
import Mustache from "mustache";
import fs from "node:fs/promises";
import path from "node:path";

export type Repo = { owner: string; name: string; fullName: string; defaultBranch: string };

export type PlanResult = {
  outcome: "noop" | "would_apply" | "error";
  details?: any;
  message?: string;
};

export type ApplyResult = {
  outcome: "applied" | "noop" | "error";
  details?: any;
  message?: string;
};

export type Playbook = {
  version: number;
  selector: { query?: string; include?: string[]; exclude?: string[]; has_files?: string[] };
  strategy: {
    mode: "pr" | "direct";
    plan: boolean;
    concurrency: number;
    failFast?: boolean;
    diffPolicy?: "strict" | "ignore-eol" | "ignore-whitespace";
    pr?: { branch?: string; title?: string; reviewers?: string[]; labels?: string[]; bodyTemplate?: string; bodyTemplatePath?: string; };
  };
  ops: Array<{ use: string; with?: any; pr?: any; issue?: any }>;
};

export type OpContext = {
  octokit: Octokit; token: string; planOnly: boolean; playbook: Playbook; workdir: string | undefined;
  fs: { readText(p: string): Promise<string>; writeText(p: string, content: string): Promise<void>; };
  renderTemplate(source?: string, filePath?: string, view?: any): Promise<string>;
  report: { row: (o: Record<string, any>) => void };
  env: { actor: string; runId: number; runUrl: string };
  inputs: any;
};

export function makeCtx(octokit: Octokit, token: string, planOnly: boolean, playbook: Playbook, workdir: string | undefined, inputs: any, addRow: (o: Record<string, any>) => void): OpContext {
  return {
    octokit, token, planOnly, playbook, workdir, inputs,
    fs: {
      async readText(p) {
        if (!workdir) throw new Error("fs.readText requires workdir");
        return fs.readFile(path.join(workdir, p), "utf-8");
      },
      async writeText(p, content) {
        if (!workdir) throw new Error("fs.writeText requires workdir");
        await fs.mkdir(path.dirname(path.join(workdir, p)), { recursive: true });
        await fs.writeFile(path.join(workdir, p), content, "utf-8");
      }
    },
    async renderTemplate(source?: string, filePath?: string, view?: any) {
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
