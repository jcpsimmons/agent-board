import { AgentBoardConfig, Ticket, WorktreePlan } from "./types.js";

export function buildCodePrompt(ticket: Ticket, worktree: WorktreePlan): string {
  return `You are executing an Agent Board code ticket.

Ticket title: ${ticket.title}
Ticket id: ${ticket.id}
Original prompt:
${ticket.prompt}

Repository: ${worktree.repoPath}
Worktree: ${worktree.worktreePath}
Base branch: ${worktree.baseBranch}
Branch: ${worktree.branchName}

Workflow:
1. Work only in the provided worktree.
2. Inspect the repo before editing.
3. Implement the requested change.
4. Run the most relevant tests/checks.
5. Commit only your intended changes.
6. Push the branch and open a draft PR with gh.
7. Never merge the PR.

Final response must be a single JSON object:
{
  "status": "review" | "blocked" | "needs_input" | "failed",
  "summary": "short human-readable summary",
  "prUrl": "draft PR URL when created",
  "question": "only when status is needs_input",
  "blocker": "only when status is blocked or failed"
}`;
}

export function buildResearchPrompt(ticket: Ticket, config: AgentBoardConfig, gatheredContext = ""): string {
  const enabledSources = Object.entries(config.sources)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(", ");
  return `You are executing an Agent Board research/doc ticket.

Ticket title: ${ticket.title}
Ticket id: ${ticket.id}
Original prompt:
${ticket.prompt}

Use the configured source adapters when available: ${enabledSources || "none"}.
Also use any local agent tools, MCP connectors, or skills available in this environment when they are relevant.

Dispatcher-gathered context:
${gatheredContext || "No dispatcher context was gathered."}

Workflow:
1. Search for high-signal evidence before writing.
2. Preserve concrete source names, links, or citations when available.
3. Create a concise architecture or research document in Notion when possible.
4. If Notion creation is unavailable, write a local Markdown artifact and report the path.

Final response must be a single JSON object:
{
  "status": "review" | "done" | "blocked" | "needs_input" | "failed",
  "summary": "short human-readable summary",
  "outputUrl": "Notion URL or local artifact path",
  "question": "only when status is needs_input",
  "blocker": "only when status is blocked or failed"
}`;
}

export function buildSplitPrompt(ticket: Ticket): string {
  return `You are planning an Agent Board parent ticket into sequential child tickets.

Ticket title: ${ticket.title}
Ticket id: ${ticket.id}
Original prompt:
${ticket.prompt}

Create child tickets that can run one at a time. For code work, prefer one feature per child and one draft PR per child.

Final response must be a single JSON object:
{
  "status": "planned" | "needs_input" | "blocked" | "failed",
  "summary": "short summary of the decomposition",
  "children": [
    {
      "title": "child title",
      "prompt": "complete child prompt",
      "taskType": "Code" | "Research Doc" | "Plan/Split",
      "repoHint": "optional repo hint",
      "priority": 3,
      "runner": "codex" | "claude"
    }
  ],
  "question": "only when status is needs_input",
  "blocker": "only when status is blocked or failed"
}`;
}
