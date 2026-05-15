import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AgentBoardConfig } from "./types.js";
import { defaultConfigPath, defaultStateDir, expandHome } from "./paths.js";

export const DEFAULT_CONFIG: AgentBoardConfig = {
  notion: {
    boardTitle: "Agent Board"
  },
  defaults: {
    runner: "codex",
    priority: 3
  },
  repos: {
    searchRoots: ["~/code", "~/src", "~/Developer"],
    aliases: {},
    worktreeRoot: path.join(defaultStateDir(), "worktrees")
  },
  sources: {
    notion: true,
    slack: true,
    granola: true,
    linear: true,
    github: true
  },
  skills: {
    mode: "copy"
  },
  launchAgent: {
    enabled: true,
    intervalSeconds: 60,
    label: "com.agent-board.dispatcher"
  }
};

export function resolveConfigPath(configPath?: string): string {
  return configPath ? expandHome(configPath) : process.env.AGENT_BOARD_CONFIG ?? defaultConfigPath();
}

export function normalizeConfig(config: AgentBoardConfig): AgentBoardConfig {
  return {
    ...config,
    repos: {
      ...config.repos,
      searchRoots: config.repos.searchRoots.map(expandHome),
      worktreeRoot: expandHome(config.repos.worktreeRoot),
      aliases: Object.fromEntries(
        Object.entries(config.repos.aliases).map(([key, value]) => [key, expandHome(value)])
      )
    },
    skills: {
      ...config.skills,
      codexDir: config.skills.codexDir ? expandHome(config.skills.codexDir) : undefined,
      claudeDir: config.skills.claudeDir ? expandHome(config.skills.claudeDir) : undefined
    }
  };
}

export function loadConfig(configPath?: string): AgentBoardConfig {
  const resolved = resolveConfigPath(configPath);
  if (!fs.existsSync(resolved)) return normalizeConfig(DEFAULT_CONFIG);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8")) as Partial<AgentBoardConfig>;
  return normalizeConfig(mergeConfig(DEFAULT_CONFIG, parsed));
}

export function writeDefaultConfig(configPath?: string): string {
  const resolved = resolveConfigPath(configPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  if (!fs.existsSync(resolved)) {
    fs.writeFileSync(resolved, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  }
  return resolved;
}

export function mergeConfig(base: AgentBoardConfig, patch: Partial<AgentBoardConfig>): AgentBoardConfig {
  return {
    notion: { ...base.notion, ...patch.notion },
    defaults: { ...base.defaults, ...patch.defaults },
    repos: {
      ...base.repos,
      ...patch.repos,
      aliases: { ...base.repos.aliases, ...patch.repos?.aliases }
    },
    sources: { ...base.sources, ...patch.sources },
    skills: { ...base.skills, ...patch.skills },
    launchAgent: { ...base.launchAgent, ...patch.launchAgent }
  };
}

export function defaultCodexSkillsDir(): string {
  return path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"), "skills");
}

export function defaultClaudeSkillsDir(): string {
  return path.join(os.homedir(), ".claude", "skills");
}
