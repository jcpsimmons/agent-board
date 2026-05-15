import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentBoardConfig } from "./types.js";
import { runCommand } from "./process.js";

export async function installLaunchAgent(config: AgentBoardConfig, dryRun = false): Promise<string> {
  if (process.platform !== "darwin") {
    return "LaunchAgent skipped: only supported on macOS";
  }

  const home = os.homedir();
  const binDir = path.join(home, ".local", "bin");
  const wrapperPath = path.join(binDir, "agent-board-tick");
  const plistPath = path.join(home, "Library", "LaunchAgents", `${config.launchAgent.label}.plist`);
  const cliPath = process.argv[1];
  const stdoutPath = path.join(home, "Library", "Logs", "agent-board.log");
  const stderrPath = path.join(home, "Library", "Logs", "agent-board.err");

  const wrapper = `#!/bin/sh
exec ${shellPath(process.execPath)} ${shellPath(cliPath)} tick "$@"
`;
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(config.launchAgent.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(wrapperPath)}</string>
  </array>
  <key>StartInterval</key>
  <integer>${config.launchAgent.intervalSeconds}</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrPath)}</string>
</dict>
</plist>
`;

  if (dryRun) return plist;

  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.mkdirSync(path.dirname(stdoutPath), { recursive: true });
  fs.writeFileSync(wrapperPath, wrapper);
  fs.chmodSync(wrapperPath, 0o755);
  fs.writeFileSync(plistPath, plist);

  const uid = process.getuid?.() ?? Number.NaN;
  if (Number.isFinite(uid)) {
    await runCommand("launchctl", ["bootout", `gui/${uid}`, plistPath]).catch(() => undefined);
    await runCommand("launchctl", ["bootstrap", `gui/${uid}`, plistPath]);
    await runCommand("launchctl", ["enable", `gui/${uid}/${config.launchAgent.label}`]);
  }

  return plistPath;
}

function shellPath(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
