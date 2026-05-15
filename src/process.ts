import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { CommandResult } from "./types.js";

export interface RunCommandOptions {
  cwd?: string;
  input?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, PATH: defaultPath(), ...options.env },
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const timeout = options.timeoutMs
      ? setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
        forceKillTimer.unref();
      }, options.timeoutMs)
      : undefined;
    timeout?.unref();

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (timedOut) {
        const seconds = Math.round((options.timeoutMs ?? 0) / 1000);
        const timeoutMessage = `Command timed out after ${seconds}s.`;
        resolve({ code: 124, stdout, stderr: [stderr.trimEnd(), timeoutMessage].filter(Boolean).join("\n") });
        return;
      }
      resolve({ code: code ?? 1, stdout, stderr });
    });

    if (options.input) child.stdin.write(options.input);
    child.stdin.end();
  });
}

export async function commandExists(command: string): Promise<boolean> {
  const result = await runCommand("sh", ["-lc", `command -v ${shellQuote(command)}`]);
  return result.code === 0;
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(shellQuote).join(" ");
}

function defaultPath(): string {
  const current = process.env.PATH ?? "";
  const prefix = [
    path.join(os.homedir(), ".local", "bin"),
    path.join(os.homedir(), ".bun", "bin"),
    "/opt/homebrew/bin"
  ];
  return [...prefix, current].join(":");
}
