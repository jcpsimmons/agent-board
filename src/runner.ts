import fs from "node:fs";
import path from "node:path";
import { RunnerName, RunnerRequest, RunnerResult, WorkerFinal } from "./types.js";
import { runCommand } from "./process.js";

export async function runAgent(request: RunnerRequest): Promise<RunnerResult> {
  fs.mkdirSync(path.dirname(request.finalOutputPath), { recursive: true });
  const result = request.runner === "codex" ? await runCodex(request) : await runClaude(request);
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
        "-a",
        "never",
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
  return runCommand(command.command, command.args, { cwd: command.cwd, input: command.input });
}

function runClaude(request: RunnerRequest) {
  const command = buildRunnerCommand(request);
  return runCommand(command.command, command.args, { cwd: command.cwd });
}

export function parseFinalOutput(finalOutputPath: string, stdout: string): WorkerFinal | undefined {
  const candidates = [];
  if (fs.existsSync(finalOutputPath)) candidates.push(fs.readFileSync(finalOutputPath, "utf8"));
  candidates.push(stdout);

  for (const candidate of candidates) {
    const parsed = parseJsonObject(candidate);
    if (parsed) return parsed;
  }
  return undefined;
}

function parseJsonObject(text: string): WorkerFinal | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as WorkerFinal;
  } catch {
    // Continue to best-effort extraction below.
  }

  for (const line of trimmed.split(/\r?\n/).reverse()) {
    const candidate = line.trim();
    if (!candidate.startsWith("{") || !candidate.endsWith("}")) continue;
    try {
      return JSON.parse(candidate) as WorkerFinal;
    } catch {
      // Continue scanning.
    }
  }

  return undefined;
}
