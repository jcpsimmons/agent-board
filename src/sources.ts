import { AgentBoardConfig, Ticket } from "./types.js";
import { runCommand } from "./process.js";

export async function gatherResearchContext(config: AgentBoardConfig, ticket: Ticket): Promise<string> {
  const sections: string[] = [];

  if (config.sources.notion) {
    sections.push(await notionSearch(ticket));
  }

  const localHints = [];
  if (config.sources.slack) localHints.push("Slack: use local Slack connector/skill if available.");
  if (config.sources.granola) localHints.push("Granola: use local Granola connector/skill if available.");
  if (config.sources.linear) localHints.push("Linear: use local Linear connector/skill if available.");
  if (config.sources.github) localHints.push("GitHub: use local gh/GitHub connector and repo search if available.");
  if (localHints.length) sections.push(`Local source hints:\n${localHints.map((hint) => `- ${hint}`).join("\n")}`);

  return sections.filter(Boolean).join("\n\n");
}

async function notionSearch(ticket: Ticket): Promise<string> {
  const query = ticket.title || ticket.prompt.slice(0, 120);
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
