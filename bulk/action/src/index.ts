import * as core from "@actions/core";
import * as github from "@actions/github";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { Playbook, makeCtx } from "./sdk/context";
import { appendCsv } from "./sdk/reporting";
import { makeOctokit } from "./github/client";
import { searchRepos } from "./github/repos";
import { createOrUpdatePR } from "./github/pr";
import { createIssue } from "./github/issues";
import { runPythonOp } from "./runners/python";
import { op as filePatch } from "./ops/file.patch";
import { cloneShallow, createBranch, hasChanges, commitAll, push } from "./github/git";
import fg from "fast-glob";
import Ajv from "ajv";

const TS_OPS: Record<string, any> = { [filePatch.id]: filePatch };

function csvEsc(s: string | undefined): string {
  const v = (s ?? "");
  return `"${v.replace(/"/g, '""')}"`;
}

async function run() {
  const playbookPath = core.getInput("playbook_path", { required: true });
  const planOnly = (core.getInput("plan_only") || "true").toLowerCase() === "true";
  const concurrency = parseInt(core.getInput("concurrency") || "6", 10);
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  if (!token) throw new Error("GITHUB_TOKEN not provided");

  // Load and validate playbook
  const pbRaw = await fs.readFile(playbookPath, "utf-8");
  const playbook = YAML.parse(pbRaw) as Playbook;
  const schemaPath = path.join(process.cwd(), "bulk/action/src/schemas/playbook.schema.json");
  const schema = JSON.parse(await fs.readFile(schemaPath, "utf-8"));
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);
  if (!validate(playbook)) {
    const errs = (validate.errors || []).map(e => `${e.instancePath || '<root>'} ${e.message}`).join("; ");
    throw new Error(`Playbook validation failed: ${errs}`);
  }

  const octokit = makeOctokit(token);
  const resultsCsv = path.join(process.cwd(), "results.csv");
  await fs.writeFile(resultsCsv, "repo,op,status,pr_url,issue_url,notes\n");

  const reposFound = await searchRepos(octokit, playbook.selector.query || `org:${github.context.repo.owner}`);
  let repos = reposFound.map(r => ({ owner: r.owner, name: r.name, fullName: `${r.owner}/${r.name}`, defaultBranch: r.default_branch }));

  if (playbook.selector.include?.length) {
    const include = new Set(playbook.selector.include);
    repos = repos.filter(r => include.has(r.fullName));
  }
  if (playbook.selector.exclude?.length) {
    const exclude = new Set(playbook.selector.exclude);
    repos = repos.filter(r => !exclude.has(r.fullName));
  }

  let i = 0;
  async function worker() {
    while (i < repos.length) {
      const repo = repos[i++];
      const repoFull = repo.fullName;
      let prUrl = ""; let issueUrl = ""; let status = "ok"; let notes = ""; let executedOp = "";
      try {
        // Checkout repo into workdir
        const tmpRoot = path.join(process.cwd(), "worktree");
        const workdir = await cloneShallow(repoFull, tmpRoot, repo.defaultBranch);
        const branch = (playbook.strategy.pr?.branch || `bulk/${path.basename(playbookPath)}`).replace("<playbook-id>", path.basename(playbookPath));

        // has_files filter (if any)
        if (playbook.selector.has_files?.length) {
          const found = await fg(playbook.selector.has_files, { cwd: workdir, dot: true });
          if (!found.length) {
            await appendCsv(resultsCsv, `${repoFull},(selector),skipped,,,"no matching has_files"\n`);
            continue;
          }
        }

        // Create work branch early
        if (!playbook.strategy.plan) {
          await createBranch(workdir, branch);
        }

        const ctx = makeCtx(octokit, token, planOnly, playbook, workdir, () => {});

        // Run ops
        for (const step of playbook.ops) {
          executedOp = step.use;
          let plan: any;
          if (TS_OPS[step.use]) {
            plan = await TS_OPS[step.use].plan(ctx, repo);
            if (!planOnly) await TS_OPS[step.use].apply(ctx, repo, plan);
          } else if (step.use.endsWith(".py")) {
            plan = await runPythonOp(step.use, { repo, inputs: step.with, mode: planOnly ? "plan" : "apply" });
          } else {
            throw new Error(`Unknown op: ${step.use}`);
          }
        }

        // Commit & push if changes and apply mode
        if (!planOnly && await hasChanges(workdir)) {
          const userName = process.env.GIT_USER_NAME || "camara-bot";
          const userEmail = process.env.GIT_USER_EMAIL || "camara-bot@users.noreply.github.com";
          const commitMsg = `[bulk] ${path.basename(playbookPath)}`;
          await commitAll(workdir, commitMsg, { userName, userEmail });
          await push(workdir, branch, token, repoFull);
        }

        // PR creation (with per-op overrides appended)
        if (playbook.strategy.mode === "pr" && !planOnly) {
          const prTitle = playbook.strategy.pr?.title || "[bulk] Update";
          const globalBody = await ctx.renderTemplate(playbook.strategy.pr?.bodyTemplate, playbook.strategy.pr?.bodyTemplatePath, {
            repo, actor: ctx.env.actor, runUrl: ctx.env.runUrl, playbook: path.basename(playbookPath)
          });
          let perOpBodies = "";
          for (const step of playbook.ops) {
            const stepBody = await ctx.renderTemplate(step.pr?.bodyTemplate, step.pr?.bodyTemplatePath, {
              repo, actor: ctx.env.actor, runUrl: ctx.env.runUrl, playbook: path.basename(playbookPath)
            });
            if (stepBody && stepBody.trim().length) {
              perOpBodies += `\n\n---\n\n${stepBody}`;
            }
          }
          const prBody = `${globalBody || ""}${perOpBodies}`.trim();
          prUrl = await createOrUpdatePR(octokit, {
            owner: repo.owner, repo: repo.name,
            head: branch, base: repo.defaultBranch,
            title: prTitle, body: prBody,
            labels: playbook.strategy.pr?.labels, reviewers: playbook.strategy.pr?.reviewers
          });
        }

        // Issue creation (with per-op overrides appended)
        if (playbook.strategy.issue?.enabled && !planOnly) {
          const issueTitle = playbook.strategy.issue?.title || "Bulk change";
          const globalIssueBody = await ctx.renderTemplate(playbook.strategy.issue?.bodyTemplate, playbook.strategy.issue?.bodyTemplatePath, {
            repo, actor: ctx.env.actor, runUrl: ctx.env.runUrl, playbook: path.basename(playbookPath)
          });
          let perOpIssueBodies = "";
          for (const step of playbook.ops) {
            const stepBody = await ctx.renderTemplate(step.issue?.bodyTemplate, step.issue?.bodyTemplatePath, {
              repo, actor: ctx.env.actor, runUrl: ctx.env.runUrl, playbook: path.basename(playbookPath)
            });
            if (stepBody && stepBody.trim().length) {
              perOpIssueBodies += `\n\n---\n\n${stepBody}`;
            }
          }
          const issueBody = `${globalIssueBody || ""}${perOpIssueBodies}`.trim();
          if (issueBody) {
            issueUrl = await createIssue(octokit, {
              owner: repo.owner, repo: repo.name,
              title: issueTitle, body: issueBody, labels: playbook.strategy.issue?.labels
            });
          }
        }

      } catch (e: any) {
        status = "error"; notes = e?.message || String(e);
      }

      await appendCsv(resultsCsv, `${repoFull},${executedOp},${status},${csvEsc(prUrl)},${csvEsc(issueUrl)},${csvEsc(notes)}\n`);
    }
  }

  await Promise.all(Array(Math.max(1, concurrency)).fill(0).map(() => worker()));
  core.info("Done.");
}

run().catch(e => { console.error(e); process.exit(1); });
