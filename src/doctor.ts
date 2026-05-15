import { AgentBoardConfig } from "./types.js";
import { commandExists, runCommand } from "./process.js";
import { NotionClient } from "./notion.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runDoctor(config: AgentBoardConfig): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  for (const command of ["node", "npm", "git", "gh", "ntn", "codex", "claude"]) {
    checks.push({
      name: command,
      ok: await commandExists(command),
      detail: await versionDetail(command)
    });
  }

  checks.push(await ghAuthCheck());
  checks.push(await ntnDoctorCheck());

  if (config.notion.dataSourceId) {
    checks.push(await boardCheck(config));
  } else {
    checks.push({
      name: "notion board",
      ok: false,
      detail: "notion.dataSourceId is not configured"
    });
  }

  return checks;
}

async function versionDetail(command: string): Promise<string> {
  const result = await runCommand(command, ["--version"]);
  return result.code === 0 ? (result.stdout || result.stderr).trim().split("\n")[0] : "not found";
}

async function ghAuthCheck(): Promise<DoctorCheck> {
  const result = await runCommand("gh", ["auth", "status"]);
  return {
    name: "gh auth",
    ok: result.code === 0,
    detail: result.code === 0 ? "authenticated" : (result.stderr || result.stdout).trim()
  };
}

async function ntnDoctorCheck(): Promise<DoctorCheck> {
  const result = await runCommand("ntn", ["doctor"]);
  return {
    name: "ntn doctor",
    ok: result.code === 0,
    detail: result.code === 0 ? "ok" : (result.stderr || result.stdout).trim()
  };
}

async function boardCheck(config: AgentBoardConfig): Promise<DoctorCheck> {
  try {
    const notion = new NotionClient(config, { dryRun: true });
    await notion.queryByStatus("Ready");
    return { name: "notion board", ok: true, detail: "query succeeded" };
  } catch (error) {
    return {
      name: "notion board",
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}
