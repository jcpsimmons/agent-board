import fs from "node:fs";
import path from "node:path";
import { AgentBoardConfig } from "./types.js";
import { defaultClaudeSkillsDir, defaultCodexSkillsDir } from "./config.js";
import { repoRootFromModule } from "./paths.js";

export interface InstallSkillsResult {
  installed: string[];
  skipped: string[];
}

const SKILL_NAMES = ["agent-board-dispatcher", "repo-feature-worker", "research-doc-worker"];

export function installSkills(config: AgentBoardConfig, dryRun = false): InstallSkillsResult {
  const root = repoRootFromModule(import.meta.url);
  const sourceRoot = path.join(root, "skills");
  const targets = [
    config.skills.codexDir ?? defaultCodexSkillsDir(),
    config.skills.claudeDir ?? defaultClaudeSkillsDir()
  ];
  const installed: string[] = [];
  const skipped: string[] = [];

  for (const targetRoot of targets) {
    for (const skillName of SKILL_NAMES) {
      const source = path.join(sourceRoot, skillName);
      const target = path.join(targetRoot, skillName);
      if (!fs.existsSync(source)) {
        skipped.push(`${skillName}: missing source`);
        continue;
      }
      if (dryRun) {
        installed.push(`${target} (dry-run)`);
        continue;
      }
      fs.mkdirSync(targetRoot, { recursive: true });
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
      if (config.skills.mode === "symlink") {
        fs.symlinkSync(source, target, "dir");
      } else {
        copyDir(source, target);
      }
      installed.push(target);
    }
  }

  return { installed, skipped };
}

function copyDir(source: string, target: string): void {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}
