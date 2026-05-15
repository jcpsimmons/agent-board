---
name: repo-feature-worker
description: Use for Agent Board code tickets that modify a repository, run tests, commit changes, push a branch, and open a draft pull request.
---

# Repo Feature Worker

Follow this workflow for code tickets launched by Agent Board.

## Workflow

1. Confirm you are in the provided worktree.
2. Inspect the repo before editing: status, branch, package/test scripts, and relevant files.
3. Implement only the ticket scope.
4. Run the most relevant tests or checks.
5. Commit only intended changes.
6. Push the branch.
7. Open a draft PR with `gh`.
8. Never merge the PR.

## If blocked

Return `needs_input` when the ticket lacks a required product decision or repo choice. Return `blocked` when auth, missing dependencies, failing unrelated tests, or unavailable services prevent completion.

## Final response

Return one JSON object:

```json
{
  "status": "review",
  "summary": "What changed and what was verified.",
  "prUrl": "https://github.com/example/repo/pull/123"
}
```

Use `failed` only when the task cannot be recovered by retrying with clearer instructions.
