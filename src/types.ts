export const STATUSES = [
  "Triage",
  "Ready",
  "Planned",
  "Running",
  "Needs Josh",
  "Blocked",
  "Review",
  "Done",
  "Failed"
] as const;

export const TASK_TYPES = ["Code", "Research Doc", "Plan/Split"] as const;
export const RUNNERS = ["codex", "claude"] as const;

export type Status = (typeof STATUSES)[number];
export type TaskType = (typeof TASK_TYPES)[number];
export type RunnerName = (typeof RUNNERS)[number];

export interface AgentBoardConfig {
  notion: {
    dataSourceId?: string;
    databaseId?: string;
    parentPageId?: string;
    boardTitle: string;
  };
  defaults: {
    runner: RunnerName;
    taskType?: TaskType;
    priority: number;
  };
  repos: {
    searchRoots: string[];
    aliases: Record<string, string>;
    worktreeRoot: string;
  };
  sources: {
    notion: boolean;
    slack: boolean;
    granola: boolean;
    linear: boolean;
    github: boolean;
  };
  skills: {
    mode: "copy" | "symlink";
    codexDir?: string;
    claudeDir?: string;
  };
  launchAgent: {
    enabled: boolean;
    intervalSeconds: number;
    label: string;
  };
}

export interface CliOptions {
  configPath?: string;
  dryRun: boolean;
  json: boolean;
  verbose: boolean;
}

export interface NotionPage {
  id: string;
  url?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Ticket {
  id: string;
  url?: string;
  title: string;
  status?: Status;
  taskType?: TaskType;
  priority: number;
  runner?: RunnerName;
  repoHint?: string;
  prompt: string;
  parentId?: string;
  raw: NotionPage;
}

export interface RepoResolution {
  ok: boolean;
  path?: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  candidates: string[];
}

export interface WorktreePlan {
  repoPath: string;
  worktreePath: string;
  baseBranch: string;
  branchName: string;
  dryRunCommands: string[];
}

export interface RunnerRequest {
  runner: RunnerName;
  cwd: string;
  prompt: string;
  ticket: Ticket;
  finalOutputPath: string;
}

export interface RunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  final?: WorkerFinal;
}

export interface WorkerFinal {
  status: "done" | "review" | "needs_input" | "blocked" | "failed" | "planned";
  summary: string;
  prUrl?: string;
  outputUrl?: string;
  question?: string;
  blocker?: string;
  children?: ChildTicket[];
}

export interface ChildTicket {
  title: string;
  prompt: string;
  taskType: TaskType;
  repoHint?: string;
  priority?: number;
  runner?: RunnerName;
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}
