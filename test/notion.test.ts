import { describe, expect, it, vi } from "vitest";
import { boardSchemaProperties, NotionClient, normalizePages } from "../src/notion.js";
import { DEFAULT_CONFIG } from "../src/config.js";

describe("notion helpers", () => {
  it("normalizes page result shapes", () => {
    expect(normalizePages([{ id: "a" }])).toEqual([{ id: "a" }]);
    expect(normalizePages({ results: [{ id: "b" }] })).toEqual([{ id: "b" }]);
    expect(normalizePages({ pages: [{ id: "c" }] })).toEqual([{ id: "c" }]);
  });

  it("defines required board fields", () => {
    const schema = boardSchemaProperties();
    expect(Object.keys(schema)).toEqual(expect.arrayContaining([
      "Title",
      "Status",
      "Task Type",
      "Priority",
      "Runner",
      "Repo Hint",
      "Prompt",
      "PR URL",
      "Output URL",
      "Run ID"
    ]));
  });

  it("writes MCP comments as Notion rich text objects", async () => {
    const client = new NotionClient({
      ...DEFAULT_CONFIG,
      notion: { ...DEFAULT_CONFIG.notion, provider: "mcp", mcpCallPath: "/tmp/mcp-call.mjs" }
    });
    const mcpJson = vi.fn(async () => ({}));
    (client as unknown as { mcpJson: typeof mcpJson }).mcpJson = mcpJson;

    await client.comment("page-1", "hello");

    expect(mcpJson).toHaveBeenCalledWith("notion-create-comment", {
      page_id: "page-1",
      rich_text: [{ type: "text", text: { content: "hello" } }]
    });
  });
});
