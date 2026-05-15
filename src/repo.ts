import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { AgentBoardConfig, RepoResolution, Ticket, WorktreePlan } from "./types.js";
import { runCommand } from "./process.js";

export function inferRepo(config: AgentBoardConfig, ticket: Ticket): RepoResolution {
  const haystack = [ticket.repoHint, ticket.title, ticket.prompt].filter(Boolean).join("\n");
  const candidates = new Set<string>();

  for (const [alias, repoPath] of Object.entries(config.repos.aliases)) {
    if (haystack.toLowerCase().includes(alias.toLowerCase()) && isGitRepo(repoPath)) {
      candidates.add(repoPath);
    }
  }

  for (const explicitPath of extractAbsolutePaths(haystack)) {
    if (isGitRepo(explicitPath)) candidates.add(explicitPath);
  }

  const repoSlug = extractGithubSlug(haystack);
  if (repoSlug) {
    for (const root of config.repos.searchRoots) {
      const repoName = repoSlug.split("/")[1];
      const localPath = path.join(root, repoName);
      if (isGitRepo(localPath) && remoteMatches(localPath, repoSlug)) candidates.add(localPath);
    }
  }

  const list = [...candidates];
  if (list.length === 1) {
    return { ok: true, path: list[0], confidence: "high", reason: "matched one local git repo", candidates: list };
  }
  if (list.length > 1) {
    return { ok: false, confidence: "low", reason: "multiple matching repos found", candidates: list };
  }
  return { ok: false, confidence: "low", reason: "no matching local git repo found", candidates: [] };
}

export async function prepareWorktree(
  config: AgentBoardConfig,
  repoPath: string,
  ticket: Ticket,
  dryRun: boolean
): Promise<WorktreePlan> {
  const baseBranch = await detectDefaultBranch(repoPath);
  const slug = slugify(ticket.title).slice(0, 40) || "ticket";
  const suffix = crypto.createHash("sha1").update(ticket.id).digest("hex").slice(0, 8);
  const branchName = `agent-board/${slug}-${suffix}`;
  const worktreePath = path.join(config.repos.worktreeRoot, `${slug}-${suffix}`);
  const dryRunCommands = [
    `git -C ${repoPath} fetch origin ${baseBranch}`,
    `git -C ${repoPath} worktree add -b ${branchName} ${worktreePath} origin/${baseBranch}`
  ];

  if (!dryRun) {
    fs.mkdirSync(config.repos.worktreeRoot, { recursive: true });
    await checked("git", ["-C", repoPath, "fetch", "origin", baseBranch]);
    if (!fs.existsSync(worktreePath)) {
      await checked("git", ["-C", repoPath, "worktree", "add", "-b", branchName, worktreePath, `origin/${baseBranch}`]);
    }
  }

  return { repoPath, worktreePath, baseBranch, branchName, dryRunCommands };
}

export async function detectDefaultBranch(repoPath: string): Promise<string> {
  const remoteShow = await runCommand("git", ["-C", repoPath, "remote", "show", "origin"]);
  const match = remoteShow.stdout.match(/HEAD branch:\s+(.+)/);
  if (remoteShow.code === 0 && match?.[1]) return match[1].trim();
  for (const candidate of ["main", "master"]) {
    const result = await runCommand("git", ["-C", repoPath, "rev-parse", "--verify", candidate]);
    if (result.code === 0) return candidate;
  }
  return "main";
}

function isGitRepo(repoPath: string): boolean {
  return fs.existsSync(path.join(repoPath, ".git"));
}

function remoteMatches(repoPath: string, slug: string): boolean {
  const configPath = path.join(repoPath, ".git", "config");
  if (!fs.existsSync(configPath)) return false;
  const config = fs.readFileSync(configPath, "utf8").toLowerCase();
  return config.includes(slug.toLowerCase());
}

function extractGithubSlug(text: string): string | undefined {
  const urlMatch = text.match(/github\.com[:/](?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+?)(?:\.git|[)\s/#?]|$)/);
  if (urlMatch?.groups) return `${urlMatch.groups.owner}/${urlMatch.groups.repo}`;
  const slugMatch = text.match(/\b(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)\b/);
  if (slugMatch?.groups) return `${slugMatch.groups.owner}/${slugMatch.groups.repo}`;
  return undefined;
}

function extractAbsolutePaths(text: string): string[] {
  const matches = text.match(/\/[A-Za-z0-9_./@+-]+/g) ?? [];
  return matches.map((value) => value.replace(/[),.;:]+$/, ""));
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function checked(command: string, args: string[]): Promise<void> {
  const result = await runCommand(command, args);
  if (result.code !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
}
