/**
 * Thrown by operations that require a git worktree to function.
 * The orchestrator catches this error and clones the repository on demand.
 */
export class NeedsWorktreeError extends Error {
  constructor(message = "Operation requires git worktree") {
    super(message);
    this.name = "NeedsWorktreeError";
  }
}
