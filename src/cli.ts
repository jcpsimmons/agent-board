#!/usr/bin/env node
import { loadConfig, resolveConfigPath, writeDefaultConfig } from "./config.js";
import { CliOptions } from "./types.js";
import { NotionClient, boardSchemaProperties } from "./notion.js";
import { Dispatcher } from "./dispatcher.js";
import { runDoctor } from "./doctor.js";
import { installSkills } from "./skills.js";
import { installLaunchAgent } from "./launchAgent.js";

async function main(): Promise<void> {
  const { command, options, rest } = parseArgs(process.argv.slice(2));
  try {
    const result = await run(command, options, rest);
    print(result, options.json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) print({ ok: false, error: message }, true);
    else console.error(`error: ${message}`);
    process.exitCode = 1;
  }
}

async function run(command: string, options: CliOptions, rest: string[]): Promise<unknown> {
  switch (command) {
    case "setup":
      return setup(options);
    case "init-board":
      return initBoard(options);
    case "tick":
      return tick(options);
    case "install-skills":
      return installSkillsCommand(options);
    case "doctor":
      return doctor(options);
    case "help":
    case "--help":
    case "-h":
      return help();
    default:
      if (!command) return help();
      throw new Error(`unknown command: ${command}. Run agent-board help.`);
  }
}

async function setup(options: CliOptions): Promise<unknown> {
  const configPath = options.dryRun ? resolveConfigPath(options.configPath) : writeDefaultConfig(options.configPath);
  const config = loadConfig(configPath);
  const skills = installSkills(config, options.dryRun);
  const launchAgent = config.launchAgent.enabled
    ? await installLaunchAgent(config, options.dryRun)
    : "LaunchAgent disabled in config";
  const checks = await runDoctor(config);
  return { ok: checks.every((check) => check.ok || check.name === "notion board"), configPath, skills, launchAgent, checks };
}

async function initBoard(options: CliOptions): Promise<unknown> {
  const config = loadConfig(options.configPath);
  if (options.dryRun && !config.notion.parentPageId) {
    return {
      dryRun: true,
      note: "Set notion.parentPageId before creating a live board.",
      boardTitle: config.notion.boardTitle,
      properties: boardSchemaProperties()
    };
  }
  const notion = new NotionClient(config, { dryRun: options.dryRun });
  return notion.createBoard();
}

async function tick(options: CliOptions): Promise<unknown> {
  const config = loadConfig(options.configPath);
  if (options.dryRun && !config.notion.dataSourceId) {
    return {
      action: "dry_run",
      message: "No notion.dataSourceId configured. A live tick would query Running and Ready cards once the board is configured."
    };
  }
  const notion = new NotionClient(config, { dryRun: options.dryRun });
  return new Dispatcher(config, notion, { dryRun: options.dryRun }).tick();
}

async function installSkillsCommand(options: CliOptions): Promise<unknown> {
  const config = loadConfig(options.configPath);
  return installSkills(config, options.dryRun);
}

async function doctor(options: CliOptions): Promise<unknown> {
  const config = loadConfig(options.configPath);
  const checks = await runDoctor(config);
  return { ok: checks.every((check) => check.ok), checks };
}

function help(): string {
  return `Agent Board

Usage:
  agent-board setup [--dry-run] [--json] [--config PATH]
  agent-board init-board [--dry-run] [--json] [--config PATH]
  agent-board tick [--dry-run] [--json] [--config PATH]
  agent-board install-skills [--dry-run] [--json] [--config PATH]
  agent-board doctor [--json] [--config PATH]

Config:
  ${resolveConfigPath()}
`;
}

function parseArgs(argv: string[]): { command: string; options: CliOptions; rest: string[] } {
  const options: CliOptions = { dryRun: false, json: false, verbose: false };
  const rest: string[] = [];
  let command = "";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--verbose" || arg === "-v") options.verbose = true;
    else if (arg === "--config") {
      options.configPath = argv[++i];
      if (!options.configPath) throw new Error("--config requires a path");
    } else if (!command) command = arg;
    else rest.push(arg);
  }

  return { command, options, rest };
}

function print(value: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (typeof value === "string") {
    console.log(value);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

main();
