import { AgentBoardConfig, ChildTicket, NotionPage, Status } from "./types.js";
import { childTicketProperties, dateProperty, richTextProperty, statusProperty, urlProperty } from "./notionProperties.js";
import { runCommand } from "./process.js";

export interface NotionClientOptions {
  dryRun?: boolean;
}

export class NotionClient {
  constructor(
    private readonly config: AgentBoardConfig,
    private readonly options: NotionClientOptions = {}
  ) {}

  async queryByStatus(status: Status): Promise<NotionPage[]> {
    if (this.config.notion.provider === "mcp") {
      const viewUrl = this.config.notion.viewUrl;
      if (!viewUrl) throw new Error("notion.viewUrl is required for MCP provider");
      const result = await this.mcpJson("notion-query-data-sources", {
        data: { mode: "view", view_url: viewUrl, page_size: 100 }
      });
      const rows = normalizeRows(result);
      return rows.filter((row) => row.Status === status).map(rowToPage);
    }

    const dataSourceId = this.requireDataSourceId();
    const result = await this.ntnJson(["api", `/v1/data_sources/${dataSourceId}/query`, "-d", JSON.stringify({
      filter: {
        property: "Status",
        select: { equals: status }
      },
      page_size: 25
    })]);
    return normalizePages(result);
  }

  async updateStatus(pageId: string, status: Status, extra: Record<string, unknown> = {}): Promise<void> {
    await this.updateProperties(pageId, {
      Status: statusProperty(status),
      "Last Update": dateProperty(new Date()),
      ...extra
    });
  }

  async updateResult(pageId: string, result: {
    status: Status;
    summary?: string;
    prUrl?: string;
    outputUrl?: string;
    runId?: string;
  }): Promise<void> {
    await this.updateProperties(pageId, {
      Status: statusProperty(result.status),
      "Last Update": dateProperty(new Date()),
      Summary: result.summary ? richTextProperty(result.summary) : undefined,
      "PR URL": urlProperty(result.prUrl),
      "Output URL": urlProperty(result.outputUrl),
      "Run ID": result.runId ? richTextProperty(result.runId) : undefined
    });
  }

  async updateProperties(pageId: string, properties: Record<string, unknown>): Promise<void> {
    const cleaned = Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined));
    if (this.options.dryRun) return;
    if (this.config.notion.provider === "mcp") {
      await this.mcpJson("notion-update-page", {
        page_id: pageId,
        command: "update_properties",
        properties: toMcpProperties(cleaned),
        content_updates: []
      });
      return;
    }
    await this.ntnJson(["api", `/v1/pages/${pageId}`, "-X", "PATCH", "-d", JSON.stringify({ properties: cleaned })]);
  }

  async comment(pageId: string, text: string): Promise<void> {
    if (this.options.dryRun) return;
    if (this.config.notion.provider === "mcp") {
      await this.mcpJson("notion-create-comment", {
        page_id: pageId,
        rich_text: [{ type: "text", text: { content: text.slice(0, 1900) } }]
      });
      return;
    }
    await this.ntnJson(["api", "/v1/comments", "-d", JSON.stringify({
      parent: { page_id: pageId },
      rich_text: [{ text: { content: text.slice(0, 1900) } }]
    })]);
  }

  async createChildTicket(child: ChildTicket, parentId?: string): Promise<NotionPage | undefined> {
    const dataSourceId = this.requireDataSourceId();
    if (this.config.notion.provider === "mcp") {
      if (this.options.dryRun) return undefined;
      const props = toMcpProperties(childTicketProperties(child, parentId));
      delete props.Parent;
      return this.mcpJson("notion-create-pages", {
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        pages: [{ properties: props }]
      }) as Promise<NotionPage>;
    }
    const body = {
      parent: { data_source_id: dataSourceId },
      properties: childTicketProperties(child, parentId)
    };
    if (this.options.dryRun) return undefined;
    return this.ntnJson(["api", "/v1/pages", "-d", JSON.stringify(body)]) as Promise<NotionPage>;
  }

  async createBoardPayload(): Promise<Record<string, unknown>> {
    const parentPageId = this.config.notion.parentPageId;
    if (!parentPageId) {
      throw new Error("notion.parentPageId is required to create a new board");
    }
    return {
      parent: { page_id: parentPageId },
      title: [{ text: { content: this.config.notion.boardTitle } }],
      properties: boardSchemaProperties()
    };
  }

  async createBoard(): Promise<unknown> {
    if (this.config.notion.provider === "mcp") {
      const parentPageId = this.config.notion.parentPageId;
      if (!parentPageId) throw new Error("notion.parentPageId is required to create a new MCP board");
      const schema = `CREATE TABLE ("Title" TITLE, "Status" SELECT('Triage':gray, 'Ready':blue, 'Planned':purple, 'Running':yellow, 'Needs Josh':orange, 'Blocked':red, 'Review':pink, 'Done':green, 'Failed':red), "Task Type" SELECT('Code':blue, 'Research Doc':green, 'Plan/Split':purple), "Priority" NUMBER, "Runner" SELECT('codex':blue, 'claude':purple), "Repo Hint" RICH_TEXT, "Prompt" RICH_TEXT, "PR URL" URL, "Output URL" URL, "Summary" RICH_TEXT, "Last Update" DATE, "Started At" DATE, "Run ID" RICH_TEXT)`;
      if (this.options.dryRun) return { parentPageId, title: this.config.notion.boardTitle, schema };
      return this.mcpJson("notion-create-database", {
        parent: { type: "page_id", page_id: parentPageId },
        title: this.config.notion.boardTitle,
        description: "Dispatch queue for local Codex and Claude Code workers.",
        schema
      });
    }
    const body = await this.createBoardPayload();
    if (this.options.dryRun) return body;
    return this.ntnJson(["api", "/v1/data_sources", "-d", JSON.stringify(body)]);
  }

  private requireDataSourceId(): string {
    const dataSourceId = this.config.notion.dataSourceId;
    if (!dataSourceId) throw new Error("notion.dataSourceId is required; run agent-board init-board or edit config.json");
    return dataSourceId;
  }

  private async ntnJson(args: string[]): Promise<unknown> {
    const result = await runCommand("ntn", args);
    if (result.code !== 0) {
      throw new Error(`ntn failed: ${result.stderr || result.stdout}`);
    }
    const text = result.stdout.trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }

  private async mcpJson(tool: string, params: unknown): Promise<unknown> {
    const callPath = this.config.notion.mcpCallPath;
    const serverUrl = this.config.notion.mcpServerUrl ?? "https://mcp.notion.com/mcp";
    if (!callPath) throw new Error("notion.mcpCallPath is required for MCP provider");
    const result = await runCommand("node", [callPath, serverUrl, tool, JSON.stringify(params)]);
    if (result.code !== 0) throw new Error(`Notion MCP call failed: ${result.stderr || result.stdout}`);
    const envelope = JSON.parse(result.stdout) as { content?: Array<{ text?: string }>; isError?: boolean };
    const text = envelope.content?.find((item) => typeof item.text === "string")?.text ?? result.stdout;
    if (envelope.isError) throw new Error(text);
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }
}

export function normalizePages(value: unknown): NotionPage[] {
  if (Array.isArray(value)) return value as NotionPage[];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.results)) return record.results as NotionPage[];
    if (Array.isArray(record.pages)) return record.pages as NotionPage[];
  }
  return [];
}

export function normalizeRows(value: unknown): Array<Record<string, unknown>> {
  if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).results)) {
    return (value as { results: Array<Record<string, unknown>> }).results;
  }
  return [];
}

export function rowToPage(row: Record<string, unknown>): NotionPage {
  const url = typeof row.url === "string" ? row.url : undefined;
  return {
    id: row.id as string | undefined ?? idFromNotionUrl(url) ?? "",
    url,
    properties: row
  };
}

export function toMcpProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!value || typeof value !== "object") {
      output[key] = value;
      continue;
    }
    const record = value as Record<string, unknown>;
    if (record.select && typeof record.select === "object") {
      output[key] = (record.select as Record<string, unknown>).name;
    } else if (record.status && typeof record.status === "object") {
      output[key] = (record.status as Record<string, unknown>).name;
    } else if (Array.isArray(record.rich_text)) {
      output[key] = textFromRichText(record.rich_text);
    } else if (Array.isArray(record.title)) {
      output[key] = textFromRichText(record.title);
    } else if (typeof record.number === "number") {
      output[key] = record.number;
    } else if ("url" in record) {
      output[key] = record.url ?? "";
    } else if (record.date && typeof record.date === "object") {
      const date = record.date as Record<string, unknown>;
      output[`date:${key}:start`] = date.start;
      output[`date:${key}:is_datetime`] = typeof date.start === "string" && date.start.includes("T") ? 1 : 0;
    } else {
      output[key] = value;
    }
  }
  return output;
}

function textFromRichText(items: unknown[]): string {
  return items.map((item) => {
    if (!item || typeof item !== "object") return "";
    const record = item as Record<string, unknown>;
    if (typeof record.plain_text === "string") return record.plain_text;
    if (record.text && typeof record.text === "object") {
      return (record.text as Record<string, unknown>).content ?? "";
    }
    return "";
  }).join("");
}

function idFromNotionUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.match(/([0-9a-f]{32})/i)?.[1];
}

export function boardSchemaProperties(): Record<string, unknown> {
  return {
    Title: { title: {} },
    Status: {
      select: {
        options: [
          { name: "Triage", color: "gray" },
          { name: "Ready", color: "blue" },
          { name: "Planned", color: "purple" },
          { name: "Running", color: "yellow" },
          { name: "Needs Josh", color: "orange" },
          { name: "Blocked", color: "red" },
          { name: "Review", color: "pink" },
          { name: "Done", color: "green" },
          { name: "Failed", color: "red" }
        ]
      }
    },
    "Task Type": {
      select: {
        options: [
          { name: "Code", color: "blue" },
          { name: "Research Doc", color: "green" },
          { name: "Plan/Split", color: "purple" }
        ]
      }
    },
    Priority: { number: { format: "number" } },
    Runner: {
      select: {
        options: [
          { name: "codex", color: "blue" },
          { name: "claude", color: "purple" }
        ]
      }
    },
    "Repo Hint": { rich_text: {} },
    Prompt: { rich_text: {} },
    Parent: { relation: {} },
    "PR URL": { url: {} },
    "Output URL": { url: {} },
    Summary: { rich_text: {} },
    "Last Update": { date: {} },
    "Started At": { date: {} },
    "Run ID": { rich_text: {} }
  };
}
