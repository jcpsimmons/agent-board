import { describe, expect, it } from "vitest";
import { buildResearchPrompt } from "../src/prompts.js";
import { DEFAULT_CONFIG } from "../src/config.js";

describe("research prompt", () => {
  it("includes dispatcher-gathered context", () => {
    const prompt = buildResearchPrompt({
      id: "page-1",
      title: "Architecture",
      prompt: "Build an architecture doc",
      priority: 3,
      raw: { id: "page-1" }
    }, DEFAULT_CONFIG, "Notion result: abc");

    expect(prompt).toContain("Dispatcher-gathered context");
    expect(prompt).toContain("Notion result: abc");
  });
});
