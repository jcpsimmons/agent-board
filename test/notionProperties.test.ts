import { describe, expect, it } from "vitest";
import { pageToTicket, statusProperty, childTicketProperties } from "../src/notionProperties.js";

describe("notion property helpers", () => {
  it("converts a Notion page into a ticket", () => {
    const ticket = pageToTicket({
      id: "page-1",
      url: "https://notion.so/page-1",
      properties: {
        Title: { title: [{ plain_text: "Fix the repo" }] },
        Status: { status: { name: "Ready" } },
        "Task Type": { select: { name: "Code" } },
        Priority: { number: 5 },
        Runner: { select: { name: "claude" } },
        "Repo Hint": { rich_text: [{ plain_text: "example-org/example" }] },
        Prompt: { rich_text: [{ plain_text: "Implement the thing" }] }
      }
    });

    expect(ticket).toMatchObject({
      id: "page-1",
      title: "Fix the repo",
      status: "Ready",
      taskType: "Code",
      priority: 5,
      runner: "claude",
      repoHint: "example-org/example",
      prompt: "Implement the thing"
    });
  });

  it("builds status and child ticket properties", () => {
    expect(statusProperty("Running")).toEqual({ status: { name: "Running" } });
    expect(childTicketProperties({
      title: "Child",
      prompt: "Do the child work",
      taskType: "Research Doc"
    }, "parent-1")).toMatchObject({
      Title: { title: [{ text: { content: "Child" } }] },
      Status: { status: { name: "Ready" } },
      "Task Type": { select: { name: "Research Doc" } },
      Parent: { relation: [{ id: "parent-1" }] }
    });
  });
});
