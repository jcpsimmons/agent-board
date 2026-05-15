import fs from "node:fs";
import path from "node:path";
import { RunnerName, RunnerRequest, RunnerResult, WorkerFinal } from "./types.js";
import { runCommand } from "./process.js";

const DEFAULT_RUNNER_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const WORKER_STATUSES = new Set<WorkerFinal["status"]>([
  "done",
  "review",
  "needs_input",
  "blocked",
  "failed",
  "planned"
]);

export async function runAgent(request: RunnerRequest): Promise<RunnerResult> {
  fs.mkdirSync(path.dirname(request.finalOutputPath), { recursive: true });
  const result = request.runner === "codex" ? await runCodex(request) : await runClaude(request);
  fs.writeFileSync(path.join(path.dirname(request.finalOutputPath), "stdout.log"), result.stdout);
  fs.writeFileSync(path.join(path.dirname(request.finalOutputPath), "stderr.log"), result.stderr);
  const final = parseFinalOutput(request.finalOutputPath, result.stdout);
  return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr, final };
}

export function buildRunnerCommand(request: RunnerRequest): { command: string; args: string[]; cwd: string; input?: string } {
  if (request.runner === "codex") {
    return {
      command: "codex",
      cwd: request.cwd,
      args: [
        "exec",
        "--json",
        "-C",
        request.cwd,
        "--skip-git-repo-check",
        "-s",
        "workspace-write",
        "-o",
        request.finalOutputPath,
        "-"
      ],
      input: request.prompt
    };
  }
  return {
    command: "claude",
    cwd: request.cwd,
    args: [
      "-p",
      "--output-format",
      "stream-json",
      "--permission-mode",
      "acceptEdits",
      request.prompt
    ]
  };
}

export function selectRunner(ticketRunner: RunnerName | undefined, defaultRunner: RunnerName): RunnerName {
  return ticketRunner ?? defaultRunner;
}

function runCodex(request: RunnerRequest) {
  const command = buildRunnerCommand(request);
  return runCommand(command.command, command.args, {
    cwd: command.cwd,
    input: command.input,
    timeoutMs: DEFAULT_RUNNER_TIMEOUT_MS
  });
}

function runClaude(request: RunnerRequest) {
  const command = buildRunnerCommand(request);
  return runCommand(command.command, command.args, { cwd: command.cwd, timeoutMs: DEFAULT_RUNNER_TIMEOUT_MS });
}

export function parseFinalOutput(finalOutputPath: string, stdout: string): WorkerFinal | undefined {
  const candidates = [];
  if (fs.existsSync(finalOutputPath)) candidates.push(fs.readFileSync(finalOutputPath, "utf8"));
  candidates.push(stdout);

  for (const candidate of candidates) {
    const parsed = parseWorkerFinalText(candidate);
    if (parsed) return parsed;
  }
  return undefined;
}

function parseWorkerFinalText(text: string, depth = 0): WorkerFinal | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (depth > 5) return undefined;

  const parsed = parseJson(trimmed);
  const final = parseWorkerFinalValue(parsed, depth);
  if (final) return final;

  for (const fenced of [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].reverse()) {
    const parsedFence = parseWorkerFinalText(fenced[1], depth + 1);
    if (parsedFence) return parsedFence;
  }

  for (const fragment of jsonObjectFragments(trimmed)) {
    const parsedFragment = parseWorkerFinalValue(parseJson(fragment), depth + 1);
    if (parsedFragment) return parsedFragment;
  }

  for (const line of trimmed.split(/\r?\n/).reverse()) {
    const candidate = line.trim();
    if (!candidate.startsWith("{") || !candidate.endsWith("}")) continue;
    const parsedLine = parseWorkerFinalValue(parseJson(candidate), depth + 1);
    if (parsedLine) return parsedLine;
  }

  return undefined;
}

function parseWorkerFinalValue(value: unknown, depth: number): WorkerFinal | undefined {
  const direct = normalizeWorkerFinal(value);
  if (direct) return direct;
  if (depth > 5) return undefined;
  if (typeof value === "string") return parseWorkerFinalText(value, depth + 1);
  if (!value || typeof value !== "object") return undefined;

  for (const text of collectStrings(value).reverse()) {
    const nested = parseWorkerFinalText(text, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

function normalizeWorkerFinal(value: unknown): WorkerFinal | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (!isWorkerStatus(record.status)) return undefined;

  const final: WorkerFinal = {
    status: record.status,
    summary: typeof record.summary === "string" ? record.summary : ""
  };
  if (typeof record.prUrl === "string") final.prUrl = record.prUrl;
  if (typeof record.outputUrl === "string") final.outputUrl = record.outputUrl;
  if (typeof record.question === "string") final.question = record.question;
  if (typeof record.blocker === "string") final.blocker = record.blocker;
  if (Array.isArray(record.children)) final.children = record.children as WorkerFinal["children"];
  return final;
}

function isWorkerStatus(value: unknown): value is WorkerFinal["status"] {
  return typeof value === "string" && WORKER_STATUSES.has(value as WorkerFinal["status"]);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item, depth + 1));
  return Object.values(value as Record<string, unknown>).flatMap((item) => collectStrings(item, depth + 1));
}

function jsonObjectFragments(text: string): string[] {
  const fragments: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        fragments.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return fragments.reverse();
}
