# Agent Board

Agent Board is a Notion-backed dispatch queue for local coding agents. It runs one ticket at a time from a Notion Kanban database, routes work to Codex or Claude Code, and writes status, blockers, draft PRs, and document links back to Notion.

## What it does

- Creates or connects to a Notion board for agent tickets.
- Processes one `Ready` ticket per tick.
- Skips new work while any ticket is `Running`.
- Supports code tickets and research/doc tickets.
- Supports Codex (`codex exec`) and Claude Code (`claude -p`) runners.
- Opens draft PRs for code work.
- Creates Notion docs or local Markdown artifacts for research work.
- Installs portable skills for Codex and Claude Code.

## Install

```sh
npm install -g agent-board
agent-board setup
```

For local development:

```sh
npm install
npm run build
node dist/cli.js doctor
```

## Commands

```sh
agent-board setup
agent-board init-board --dry-run
agent-board tick --dry-run
agent-board install-skills
agent-board doctor
```

The default config path is:

```text
~/.config/agent-board/config.json
```

See `examples/config.json` for the portable config shape.

## Board fields

Agent Board expects these Notion fields:

- `Title`
- `Status`
- `Task Type`
- `Priority`
- `Runner`
- `Repo Hint`
- `Prompt`
- `Parent`
- `PR URL`
- `Output URL`
- `Summary`
- `Last Update`
- `Started At`
- `Run ID`

Statuses:

```text
Triage, Ready, Planned, Running, Needs Josh, Blocked, Review, Done, Failed
```

Task types:

```text
Code, Research Doc, Plan/Split
```

## Notion providers

Agent Board supports two Notion access modes:

- `ntn`: uses the Notion public API through the `ntn` CLI.
- `mcp`: uses a local MCP bridge such as `~/.openclaw/workspace/scripts/mcp-call.mjs`.

Use `mcp` when your Notion connector has access to pages/databases that the public API token cannot reach. MCP-backed boards should set both `dataSourceId` and `viewUrl`; the dispatcher queries the configured view and filters rows locally.

## Code tickets

For code work, Agent Board infers the repo from:

- `Repo Hint`
- configured repo aliases
- GitHub URLs or `owner/repo` slugs in the prompt
- local clones under configured search roots

If repo inference is ambiguous, the card moves to `Needs Josh` and gets a comment with the missing decision.

When a code ticket runs, Agent Board creates an isolated worktree from the remote default branch and prompts the selected runner to implement, test, commit, push, and open a draft PR. v1 never merges PRs.

## Research/doc tickets

Research workers use configured source adapters plus whatever local tools and skills the selected runner can access. Typical sources include Notion connected search, Slack, Granola, Linear, GitHub, Drive, and repo search.

The worker should create a Notion document when possible and return its URL. If Notion creation is blocked, it should return a local Markdown artifact path.

## Safety model

- One ticket runs at a time.
- Dry-run commands do not write to Notion or start workers.
- Ambiguity becomes `Needs Josh`.
- Auth/tool failures become `Blocked` or `Failed`.
- PRs are draft by default.
- No auto-merge in v1.
