import { describe, expect, it } from "vitest";
import { boardSchemaProperties, normalizePages } from "../src/notion.js";

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
});
