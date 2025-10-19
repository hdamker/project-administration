import * as core from "@actions/core";
import * as github from "@actions/github";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import YAML from "yaml";
import { makeCtx } from "./sdk/context.js";
import { appendCsv, appendJsonl } from "./sdk/reporting.js";
import { PlanReporter } from "./sdk/plan-reporter.js";
import { makeOctokit } from "./github/client.js";
import { searchRepos } from "./github/repos.js";
import { createOrUpdatePR } from "./github/pr.js";
import { createOrUpdateIssue } from "./github/issues.js";
import { runPythonOp } from "./runners/python.js";
import { op as filePatch } from "./ops/file.patch.js";
import { cloneShallow, createBranch, hasChanges, hasMeaningfulChanges, commitAll, push } from "./github/git.js";
import fg from "fast-glob";
import { Ajv2020 } from "ajv/dist/2020.js";
const TS_OPS = { [filePatch.id]: filePatch };
function csvEsc(s) {
    const v = (s ?? "");
    return `"${v.replace(/"/g, '""')}"`;
}
async function countFailedRepos(csvPath) {
    const content = await fs.readFile(csvPath, "utf-8");
    return content.split("\n").filter(line => line.includes(",error,")).length;
}
async function run() {
    const playbookPath = core.getInput("playbook_path", { required: true });
    const planOnly = (core.getInput("plan_only") || "true").toLowerCase() === "true";
    const concurrency = parseInt(core.getInput("concurrency") || "6", 10);
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
    if (!token)
        throw new Error("GITHUB_TOKEN not provided");
    // Load and validate playbook
    const pbRaw = await fs.readFile(playbookPath, "utf-8");
    const playbook = YAML.parse(pbRaw);
    const schemaPath = path.join(process.cwd(), "bulk/action/src/schemas/playbook.schema.json");
    const schema = JSON.parse(await fs.readFile(schemaPath, "utf-8"));
    const ajv = new Ajv2020({ allErrors: true });
    const validate = ajv.compile(schema);
    if (!validate(playbook)) {
        const errs = (validate.errors || []).map((e) => `${e.instancePath || '<root>'} ${e.message}`).join("; ");
        throw new Error(`Playbook validation failed: ${errs}`);
    }
    const octokit = makeOctokit(token);
    const resultsCsv = path.join(process.cwd(), "results.csv");
    await fs.writeFile(resultsCsv, "repo,op,status,pr_url,issue_url,notes\n");
    const planMdPath = path.join(process.cwd(), "plan.md");
    const planReporter = new PlanReporter(planMdPath);
    const jsonlPath = path.join(process.cwd(), "results.jsonl");
    const searchQuery = playbook.selector.query || `org:${github.context.repo.owner}`;
    core.info(`🔍 Repository search query: ${searchQuery}`);
    const reposFound = await searchRepos(octokit, searchQuery);
    core.info(`📦 Search found ${reposFound.length} repositories`);
    let repos = reposFound.map(r => ({ owner: r.owner, name: r.name, fullName: `${r.owner}/${r.name}`, defaultBranch: r.default_branch }));
    if (playbook.selector.include?.length) {
        core.info(`🔽 Applying include filter: ${playbook.selector.include.join(", ")}`);
        const include = new Set(playbook.selector.include);
        const beforeCount = repos.length;
        repos = repos.filter(r => include.has(r.fullName));
        core.info(`✅ Include filter: ${beforeCount} → ${repos.length} repositories`);
    }
    if (playbook.selector.exclude?.length) {
        core.info(`🚫 Applying exclude filter: ${playbook.selector.exclude.join(", ")}`);
        const beforeCount = repos.length;
        const exclude = new Set(playbook.selector.exclude);
        repos = repos.filter(r => !exclude.has(r.fullName));
        core.info(`✅ Exclude filter: ${beforeCount} → ${repos.length} repositories`);
    }
    core.info(`🎯 Final repository count: ${repos.length}`);
    if (repos.length > 0) {
        core.info(`📋 Repositories to process: ${repos.map(r => r.fullName).join(", ")}`);
    }
    // Write plan.md header
    await planReporter.writeHeader(playbookPath, playbook, repos.length, planOnly);
    let i = 0;
    let totalSkipped = 0;
    async function worker() {
        while (i < repos.length) {
            const repo = repos[i++];
            const repoFull = repo.fullName;
            let prUrl = "";
            let issueUrl = "";
            let status = "ok";
            let notes = "";
            let executedOp = "";
            let changeStatus = "";
            try {
                // Checkout repo into workdir
                const tmpRoot = path.join(process.cwd(), "worktree");
                const workdir = await cloneShallow(repoFull, tmpRoot, repo.defaultBranch);
                // Generate branch name with hash suffix to prevent collisions across waves
                const baseBranch = (playbook.strategy.pr?.branch || `bulk/${path.basename(playbookPath)}`).replace("<playbook-id>", path.basename(playbookPath));
                const playbookHash = crypto.createHash("sha1").update(JSON.stringify(playbook)).digest("hex").slice(0, 7);
                const branch = `${baseBranch}-${playbookHash}`;
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
                const ctx = makeCtx(octokit, token, planOnly, playbook, workdir, () => { });
                // Run ops
                for (const step of playbook.ops) {
                    executedOp = step.use;
                    let plan;
                    if (TS_OPS[step.use]) {
                        plan = await TS_OPS[step.use].plan(ctx, repo);
                        if (!planOnly)
                            await TS_OPS[step.use].apply(ctx, repo, plan);
                    }
                    else if (step.use.endsWith(".py")) {
                        plan = await runPythonOp(step.use, { repo, inputs: step.with, mode: planOnly ? "plan" : "apply" });
                    }
                    else {
                        throw new Error(`Unknown op: ${step.use}`);
                    }
                }
                // Detect and report change status
                core.info(`🔍 Checking for changes in ${workdir}`);
                const hasAnyChanges = await hasChanges(workdir);
                core.info(`📊 hasChanges() = ${hasAnyChanges}`);
                const hasMeaningful = hasAnyChanges && await hasMeaningfulChanges(workdir);
                if (hasAnyChanges) {
                    core.info(`📊 hasMeaningfulChanges() = ${hasMeaningful}`);
                }
                if (planOnly) {
                    if (hasMeaningful) {
                        changeStatus = "would apply";
                    }
                    else if (hasAnyChanges) {
                        changeStatus = "would skip (whitespace only)";
                    }
                    else {
                        changeStatus = "no changes";
                    }
                    core.info(`📊 Change status in plan mode: ${changeStatus}`);
                }
                // Commit & push if meaningful changes and apply mode
                let changesPushed = false;
                if (!planOnly && hasMeaningful) {
                    const userName = process.env.GIT_USER_NAME || "camara-bot";
                    const userEmail = process.env.GIT_USER_EMAIL || "camara-bot@users.noreply.github.com";
                    const commitMsg = `[bulk] ${path.basename(playbookPath)}`;
                    await commitAll(workdir, commitMsg, { userName, userEmail });
                    await push(workdir, branch, token, repoFull);
                    changesPushed = true;
                    changeStatus = "applied";
                }
                else if (!planOnly && hasAnyChanges) {
                    changeStatus = "skipped (whitespace only)";
                }
                else if (!planOnly) {
                    changeStatus = "no changes";
                }
                // PR creation (only if changes were pushed)
                if (playbook.strategy.mode === "pr" && !planOnly && changesPushed) {
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
                        issueUrl = await createOrUpdateIssue(octokit, {
                            owner: repo.owner, repo: repo.name,
                            title: issueTitle, body: issueBody, labels: playbook.strategy.issue?.labels
                        });
                    }
                }
            }
            catch (e) {
                status = "error";
                notes = e?.message || String(e);
            }
            await appendCsv(resultsCsv, `${repoFull},${executedOp},${status},${csvEsc(prUrl)},${csvEsc(issueUrl)},${csvEsc(notes)}\n`);
            await appendJsonl(jsonlPath, {
                timestamp: new Date().toISOString(),
                repo: repoFull,
                op: executedOp,
                status,
                prUrl,
                issueUrl,
                notes
            });
            await planReporter.addRepo(repo, status, notes, prUrl, issueUrl, changeStatus);
            if (status === "skipped")
                totalSkipped++;
            // Fail-fast: stop processing if error and failFast enabled
            if (status === "error" && playbook.strategy.failFast) {
                core.setFailed(`Fail-fast triggered by error in ${repoFull}: ${notes}`);
                process.exit(1);
            }
        }
    }
    await Promise.all(Array(Math.max(1, concurrency)).fill(0).map(() => worker()));
    // Check for failures and exit with error if any repos failed
    const failedCount = await countFailedRepos(resultsCsv);
    // Finalize plan.md with summary
    await planReporter.finalize(repos.length, failedCount, totalSkipped);
    if (failedCount > 0) {
        core.setFailed(`${failedCount} repositories failed during execution`);
        process.exit(1);
    }
    core.info("Done.");
}
run().catch(e => { console.error(e); process.exit(1); });
