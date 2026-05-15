---
name: agent-board-dispatcher
description: Use when working from an Agent Board Notion ticket, updating ticket status, asking for clarification, or reporting blockers/results back to the board.
---

# Agent Board Dispatcher

Agent Board tickets are human-owned queue items. Treat the Notion card as the source of truth for intent, status, blockers, and result links.

## Status contract

- `Ready`: work can start.
- `Running`: one local agent is actively working on it.
- `Needs Josh`: you need a human decision or missing context.
- `Blocked`: external dependency or tool/auth failure prevents progress.
- `Review`: artifact, PR, or doc is ready for human review.
- `Done`: complete without needing review.
- `Failed`: unrecoverable run failure.

## Working rules

1. Do not start a second ticket if another ticket is `Running`.
2. If repo, task type, or requested output is ambiguous, ask on the card instead of guessing.
3. Keep comments specific: state the missing decision, exact blocker, or next action.
4. Never merge PRs from Agent Board v1.
5. Final output should be structured JSON when running non-interactively:

```json
{
  "status": "review",
  "summary": "Implemented the requested change and opened a draft PR.",
  "prUrl": "https://github.com/example/repo/pull/123"
}
```

Use `question` for `needs_input`, `blocker` for `blocked` or `failed`, and `outputUrl` for docs or local artifacts.
