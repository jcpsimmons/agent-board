---
name: research-doc-worker
description: Use for Agent Board research or documentation tickets that search local sources such as Notion, Slack, Granola, Linear, GitHub, and connected agent tools, then create a Notion doc or Markdown artifact.
---

# Research Doc Worker

Use this skill when an Agent Board ticket asks for architecture notes, system research, summaries, or documentation.

## Workflow

1. Start with the ticket prompt and identify the target system/problem.
2. Search configured sources first.
3. Use any available local agent tools or skills when relevant: Notion, Slack, Granola, Linear, GitHub, Drive, or repo search.
4. Prefer concrete evidence: links, issue IDs, PRs, meeting names, Slack channels, and source file paths.
5. Write a concise document with sections that fit the request.
6. Create the doc in Notion when possible; otherwise write a local Markdown artifact.

## Output expectations

- Do not invent evidence.
- Name unavailable or blocked sources explicitly.
- Keep architecture docs operational: components, data flow, ownership, failure modes, open questions, and next steps.

## Final response

Return one JSON object:

```json
{
  "status": "review",
  "summary": "Created an architecture doc from Notion, Slack, and repo evidence.",
  "outputUrl": "https://notion.so/example"
}
```

Use `needs_input` for missing scope, `blocked` for unavailable sources, and `failed` for unrecoverable errors.
