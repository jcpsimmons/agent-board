import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRunnerCommand, parseFinalOutput, selectRunner } from "../src/runner.js";
import { RunnerRequest } from "../src/types.js";

const baseRequest: RunnerRequest = {
  runner: "codex",
  cwd: "/tmp/work",
  prompt: "Do work",
  finalOutputPath: "/tmp/final.json",
  ticket: {
    id: "page-1",
    title: "Ticket",
    prompt: "Do work",
    priority: 3,
    raw: { id: "page-1" }
  }
};

describe("runner helpers", () => {
  it("builds codex command", () => {
    const command = buildRunnerCommand(baseRequest);
    expect(command.command).toBe("codex");
    expect(command.args).toContain("exec");
    expect(command.args).toContain("--json");
    expect(command.args).toContain("-C");
    expect(command.input).toBe("Do work");
  });

  it("builds claude command", () => {
    const command = buildRunnerCommand({ ...baseRequest, runner: "claude" });
    expect(command.command).toBe("claude");
    expect(command.args).toContain("-p");
    expect(command.args).toContain("--output-format");
    expect(command.args).toContain("stream-json");
  });

  it("selects ticket runner before default", () => {
    expect(selectRunner("claude", "codex")).toBe("claude");
    expect(selectRunner(undefined, "codex")).toBe("codex");
  });

  it("parses final output from file or stdout JSONL", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-board-"));
    const finalPath = path.join(dir, "final.json");
    fs.writeFileSync(finalPath, JSON.stringify({ status: "review", summary: "done", prUrl: "https://example.com/pr" }));
    expect(parseFinalOutput(finalPath, "")).toMatchObject({ status: "review", prUrl: "https://example.com/pr" });

    fs.rmSync(finalPath);
    const stdout = `{"type":"event"}\n{"status":"blocked","summary":"blocked","blocker":"auth"}`;
    expect(parseFinalOutput(finalPath, stdout)).toMatchObject({ status: "blocked", blocker: "auth" });
  });
});
