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
    const dataSourceId = this.requireDataSourceId();
    const result = await this.ntnJson(["api", `/v1/data_sources/${dataSourceId}/query`, "-d", JSON.stringify({
      filter: {
        property: "Status",
        status: { equals: status }
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
    await this.ntnJson(["api", `/v1/pages/${pageId}`, "-X", "PATCH", "-d", JSON.stringify({ properties: cleaned })]);
  }

  async comment(pageId: string, text: string): Promise<void> {
    if (this.options.dryRun) return;
    await this.ntnJson(["api", "/v1/comments", "-d", JSON.stringify({
      parent: { page_id: pageId },
      rich_text: [{ text: { content: text.slice(0, 1900) } }]
    })]);
  }

  async createChildTicket(child: ChildTicket, parentId?: string): Promise<NotionPage | undefined> {
    const dataSourceId = this.requireDataSourceId();
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

export function boardSchemaProperties(): Record<string, unknown> {
  return {
    Title: { title: {} },
    Status: {
      status: {
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
