import { AgentBoardConfig, Ticket } from "./types.js";
import { runCommand } from "./process.js";

export async function gatherResearchContext(config: AgentBoardConfig, ticket: Ticket): Promise<string> {
  const sections: string[] = [];

  if (config.sources.notion) {
    sections.push(await notionSearch(config, ticket));
  }

  const localHints = [];
  if (config.sources.slack) localHints.push("Slack: use local Slack connector/skill if available.");
  if (config.sources.granola) localHints.push("Granola: use local Granola connector/skill if available.");
  if (config.sources.linear) localHints.push("Linear: use local Linear connector/skill if available.");
  if (config.sources.github) localHints.push("GitHub: use local gh/GitHub connector and repo search if available.");
  if (localHints.length) sections.push(`Local source hints:\n${localHints.map((hint) => `- ${hint}`).join("\n")}`);

  return sections.filter(Boolean).join("\n\n");
}

async function notionSearch(config: AgentBoardConfig, ticket: Ticket): Promise<string> {
  const query = ticket.title || ticket.prompt.slice(0, 120);
  // MCP-backed installs have broader access on many workspaces than public API tokens.
  // Use the same local MCP bridge the Notion skill uses when configured.
  if (config.notion.provider === "mcp") {
    return mcpNotionSearch(config, query);
  }
  const result = await runCommand("ntn", [
    "api",
    "/v1/search",
    "-d",
    JSON.stringify({ query, page_size: 5 })
  ]);
  if (result.code !== 0) {
    return `Notion search failed:\n${(result.stderr || result.stdout).trim()}`;
  }
  return `Notion search for "${query}":\n${result.stdout.trim().slice(0, 6000)}`;
}

async function mcpNotionSearch(config: AgentBoardConfig, query: string): Promise<string> {
  const callPath = config.notion.mcpCallPath ?? `${process.env.HOME}/.openclaw/workspace/scripts/mcp-call.mjs`;
  const serverUrl = config.notion.mcpServerUrl ?? "https://mcp.notion.com/mcp";
  const result = await runCommand("node", [
    callPath,
    serverUrl,
    "notion-search",
    JSON.stringify({ query, query_type: "internal", page_size: 5, max_highlight_length: 200, filters: {} })
  ]);
  if (result.code !== 0) return `Notion MCP search failed:\n${(result.stderr || result.stdout).trim()}`;
  return `Notion MCP search for "${query}":\n${result.stdout.trim().slice(0, 6000)}`;
}
