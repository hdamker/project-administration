import { OpContext, Repo, PlanResult, ApplyResult } from "../sdk/context.js";
import { NeedsWorktreeError } from "../sdk/errors.js";
import * as core from "@actions/core";

export const op = {
  id: "issue.create@v1",
  describe: (inputs: any) => `Create or update issue by title`,

  async plan(ctx: OpContext, repo: Repo): Promise<PlanResult> {
    // Only need worktree if using file-based template
    if (ctx.inputs.bodyTemplatePath && !ctx.workdir) {
      throw new NeedsWorktreeError("issue.create@v1 requires worktree for bodyTemplatePath");
    }

    const title: string = ctx.inputs.title;
    if (!title) {
      return {
        outcome: "error",
        message: "Missing required field: title"
      };
    }

    const labels: string[] = ctx.inputs.labels || [];

    core.info(`🔍 issue.create@v1: Checking for existing issue "${title}" in ${repo.fullName}`);

    // Render template (works with or without worktree)
    const body = await ctx.renderTemplate(
      ctx.inputs.bodyTemplate,
      ctx.inputs.bodyTemplatePath,
      { repo, actor: ctx.env.actor, runUrl: ctx.env.runUrl }
    );

    if (!body || !body.trim()) {
      return {
        outcome: "error",
        message: "Issue body is empty (check bodyTemplate or bodyTemplatePath)"
      };
    }

    core.info(`📄 issue.create@v1: Rendered body (${body.length} chars)`);

    try {
      // Check existing issues (API read, no mutation)
      const existing = await ctx.octokit.issues.listForRepo({
        owner: repo.owner,
        repo: repo.name,
        state: "open",
        per_page: 100
      });

      core.info(`📋 issue.create@v1: Found ${existing.data.length} open issues`);

      // Find by exact title match (trimmed for robustness)
      const match = existing.data.find(i => i.title.trim() === title.trim());

      if (!match) {
        core.info(`✅ issue.create@v1: No existing issue found - would create`);
        return {
          outcome: "would_apply",
          details: { action: "would_create", title },
          message: `Would create issue: ${title}`
        };
      }

      core.info(`🔎 issue.create@v1: Found existing issue #${match.number}`);

      // Check if update needed (body or labels changed)
      const existingBody = (match.body || "").trim();
      const newBody = body.trim();
      const bodyChanged = existingBody !== newBody;

      const existingLabels = new Set(
        match.labels.map(l => typeof l === "string" ? l : l.name || "")
      );
      const newLabels = new Set(labels);
      const labelsChanged = existingLabels.size !== newLabels.size ||
                           [...newLabels].some(l => !existingLabels.has(l));

      if (bodyChanged || labelsChanged) {
        core.info(`✏️  issue.create@v1: Changes detected (body: ${bodyChanged}, labels: ${labelsChanged}) - would update`);
        return {
          outcome: "would_apply",
          details: {
            action: "would_update",
            issue: match.number,
            url: match.html_url,
            bodyChanged,
            labelsChanged
          },
          message: `Would update issue #${match.number}`
        };
      }

      core.info(`⏭️  issue.create@v1: Issue #${match.number} already up-to-date`);
      return {
        outcome: "noop",
        details: {
          action: "already_current",
          issue: match.number,
          url: match.html_url
        },
        message: `Issue #${match.number} already up-to-date`
      };
    } catch (e: any) {
      core.error(`❌ issue.create@v1: API error - ${e.message}`);
      return {
        outcome: "error",
        message: `GitHub API error: ${e.message}`
      };
    }
  },

  async apply(ctx: OpContext, repo: Repo, plan: PlanResult): Promise<ApplyResult> {
    if (plan.outcome === "noop") {
      core.info(`⏭️  issue.create@v1: Skipping (no changes needed)`);
      return {
        outcome: "noop",
        details: plan.details,
        message: plan.message
      };
    }

    if (plan.outcome === "error") {
      return {
        outcome: "error",
        message: plan.message
      };
    }

    const title: string = ctx.inputs.title;
    const labels: string[] = ctx.inputs.labels || [];

    // Re-render template (in case context changed)
    const body = await ctx.renderTemplate(
      ctx.inputs.bodyTemplate,
      ctx.inputs.bodyTemplatePath,
      { repo, actor: ctx.env.actor, runUrl: ctx.env.runUrl }
    );

    try {
      if (plan.details?.action === "would_create") {
        core.info(`📝 issue.create@v1: Creating issue "${title}"`);
        const res = await ctx.octokit.issues.create({
          owner: repo.owner,
          repo: repo.name,
          title,
          body,
          labels
        });
        core.info(`✅ issue.create@v1: Created issue #${res.data.number} at ${res.data.html_url}`);
        return {
          outcome: "applied",
          details: {
            action: "created",
            issue: res.data.number,
            url: res.data.html_url
          },
          message: `Created issue #${res.data.number}`
        };
      }

      if (plan.details?.action === "would_update") {
        const issueNumber = plan.details.issue;
        core.info(`📝 issue.create@v1: Updating issue #${issueNumber}`);

        await ctx.octokit.issues.update({
          owner: repo.owner,
          repo: repo.name,
          issue_number: issueNumber,
          title,
          body
        });

        if (labels.length) {
          await ctx.octokit.issues.setLabels({
            owner: repo.owner,
            repo: repo.name,
            issue_number: issueNumber,
            labels
          });
        }

        const updated = await ctx.octokit.issues.get({
          owner: repo.owner,
          repo: repo.name,
          issue_number: issueNumber
        });

        core.info(`✅ issue.create@v1: Updated issue #${issueNumber} at ${updated.data.html_url}`);
        return {
          outcome: "applied",
          details: {
            action: "updated",
            issue: issueNumber,
            url: updated.data.html_url
          },
          message: `Updated issue #${issueNumber}`
        };
      }

      return {
        outcome: "error",
        message: `Unknown plan action: ${plan.details?.action}`
      };
    } catch (e: any) {
      core.error(`❌ issue.create@v1: API error - ${e.message}`);
      return {
        outcome: "error",
        message: `GitHub API error: ${e.message}`
      };
    }
  }
};
