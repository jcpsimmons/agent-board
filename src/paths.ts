import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export function expandHome(input: string): string {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function defaultConfigPath(): string {
  return path.join(os.homedir(), ".config", "agent-board", "config.json");
}

export function defaultStateDir(): string {
  return path.join(os.homedir(), ".cache", "agent-board");
}

export function repoRootFromModule(metaUrl: string): string {
  let dir = path.dirname(fileURLToPath(metaUrl));
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json")) && fs.existsSync(path.join(dir, "skills"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), "..");
}
