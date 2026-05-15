import { describe, expect, it, vi } from "vitest";
import { Dispatcher } from "../src/dispatcher.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { NotionClient } from "../src/notion.js";

describe("dispatcher", () => {
  it("does not start a ticket while one is already running", async () => {
    const notion = {
      queryByStatus: vi.fn(async (status: string) => status === "Running" ? [{ id: "running" }] : [])
    } as unknown as NotionClient;

    const result = await new Dispatcher(DEFAULT_CONFIG, notion).tick();
    expect(result.action).toBe("skipped_running");
  });

  it("dry-runs the highest priority ready ticket", async () => {
    const notion = {
      queryByStatus: vi.fn(async (status: string) => {
        if (status === "Running") return [];
        return [
          {
            id: "low",
            properties: {
              Title: { title: [{ plain_text: "Low" }] },
              Status: { status: { name: "Ready" } },
              "Task Type": { select: { name: "Research Doc" } },
              Priority: { number: 1 },
              Prompt: { rich_text: [{ plain_text: "Write docs" }] }
            }
          },
          {
            id: "high",
            properties: {
              Title: { title: [{ plain_text: "High" }] },
              Status: { status: { name: "Ready" } },
              "Task Type": { select: { name: "Code" } },
              Priority: { number: 9 },
              Prompt: { rich_text: [{ plain_text: "Fix code" }] }
            }
          }
        ];
      })
    } as unknown as NotionClient;

    const result = await new Dispatcher(DEFAULT_CONFIG, notion, { dryRun: true }).tick();
    expect(result).toMatchObject({
      action: "dry_run",
      ticket: { id: "high", title: "High", taskType: "Code" }
    });
  });
});
