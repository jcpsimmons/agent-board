import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { CommandResult } from "./types.js";

export interface RunCommandOptions {
  cwd?: string;
  input?: string;
  env?: NodeJS.ProcessEnv;
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
