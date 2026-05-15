import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inferRepo } from "../src/repo.js";
import { AgentBoardConfig, Ticket } from "../src/types.js";
import { DEFAULT_CONFIG } from "../src/config.js";

describe("repo inference", () => {
  it("uses configured aliases", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-board-repo-"));
    const repoPath = path.join(root, "example");
    makeFakeRepo(repoPath, "example-org/example");
    const config: AgentBoardConfig = {
      ...DEFAULT_CONFIG,
      repos: {
        ...DEFAULT_CONFIG.repos,
        aliases: { example: repoPath },
        searchRoots: [root]
      }
    };
    const ticket = makeTicket("Please fix example");
    expect(inferRepo(config, ticket)).toMatchObject({ ok: true, path: repoPath });
  });

  it("matches GitHub slugs under search roots", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-board-repo-"));
    const repoPath = path.join(root, "app");
    makeFakeRepo(repoPath, "acme/app");
    const config: AgentBoardConfig = {
      ...DEFAULT_CONFIG,
      repos: {
        ...DEFAULT_CONFIG.repos,
        aliases: {},
        searchRoots: [root]
      }
    };
    expect(inferRepo(config, makeTicket("Work in https://github.com/acme/app/pull/1"))).toMatchObject({
      ok: true,
      path: repoPath
    });
  });
});

function makeTicket(prompt: string): Ticket {
  return {
    id: "page-1",
    title: prompt,
    prompt,
    priority: 3,
    raw: { id: "page-1" }
  };
}

function makeFakeRepo(repoPath: string, slug: string): void {
  fs.mkdirSync(path.join(repoPath, ".git"), { recursive: true });
  fs.writeFileSync(path.join(repoPath, ".git", "config"), `[remote "origin"]\n\turl = https://github.com/${slug}.git\n`);
}
