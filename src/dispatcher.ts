import path from "node:path";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
import { AgentBoardConfig, Status, Ticket, WorkerFinal } from "./types.js";
import { NotionClient } from "./notion.js";
import { dateProperty, pageToTicket, richTextProperty } from "./notionProperties.js";
import { buildCodePrompt, buildResearchPrompt, buildSplitPrompt } from "./prompts.js";
import { inferRepo, prepareWorktree } from "./repo.js";
import { runAgent, selectRunner } from "./runner.js";
import { defaultStateDir } from "./paths.js";
import { gatherResearchContext } from "./sources.js";

export interface TickResult {
  action: "idle" | "skipped_running" | "needs_input" | "dry_run" | "started" | "completed" | "failed";
  message: string;
  ticket?: Pick<Ticket, "id" | "title" | "taskType">;
  status?: Status;
}

export interface DispatcherOptions {
  dryRun?: boolean;
}

export class Dispatcher {
  constructor(
    private readonly config: AgentBoardConfig,
    private readonly notion: NotionClient,
    private readonly options: DispatcherOptions = {}
  ) {}

  async tick(): Promise<TickResult> {
    const running = await this.notion.queryByStatus("Running");
    if (running.length > 0) {
      return {
        action: "skipped_running",
        message: `Skipped: ${running.length} ticket(s) already Running`
      };
    }

    const readyPages = await this.notion.queryByStatus("Ready");
    const tickets = readyPages.map(pageToTicket).sort((a, b) => b.priority - a.priority);
    const ticket = tickets[0];
    if (!ticket) return { action: "idle", message: "No Ready tickets found" };

    if (!ticket.taskType) {
      return this.needsInput(ticket, "I could not infer Task Type. Set Task Type to Code, Research Doc, or Plan/Split.");
    }

    if (this.options.dryRun) {
      return {
        action: "dry_run",
        message: `Would run ${ticket.taskType} ticket: ${ticket.title}`,
        ticket: summarizeTicket(ticket)
      };
    }

    const runId = makeRunId(ticket);
    await this.notion.updateStatus(ticket.id, "Running", {
      "Started At": dateProperty(new Date()),
      "Run ID": richTextProperty(runId)
    });

    try {
      const result = await this.executeTicket(ticket, runId);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.notion.updateResult(ticket.id, {
        status: "Failed",
        summary: message,
        runId
      });
      await this.notion.comment(ticket.id, `Agent Board failed:\n\n${message}`);
      return {
        action: "failed",
        message,
        ticket: summarizeTicket(ticket),
        status: "Failed"
      };
    }
  }

  private async executeTicket(ticket: Ticket, runId: string): Promise<TickResult> {
    if (ticket.taskType === "Code") return this.executeCodeTicket(ticket, runId);
    if (ticket.taskType === "Research Doc") return this.executeResearchTicket(ticket, runId);
    return this.executeSplitTicket(ticket, runId);
  }

  private async executeCodeTicket(ticket: Ticket, runId: string): Promise<TickResult> {
    const repo = inferRepo(this.config, ticket);
    if (!repo.ok || !repo.path) {
      return this.needsInput(ticket, `I could not confidently infer the repo. Reason: ${repo.reason}. Candidates: ${repo.candidates.join(", ") || "none"}`);
    }
    const worktree = await prepareWorktree(this.config, repo.path, ticket, false);
    const runner = selectRunner(ticket.runner, this.config.defaults.runner);
    const finalOutputPath = path.join(defaultStateDir(), "runs", runId, "final.json");
    const prompt = buildCodePrompt(ticket, worktree);
    const result = await runAgent({ runner, cwd: worktree.worktreePath, prompt, ticket, finalOutputPath });
    return this.applyWorkerResult(ticket, runId, result.final, result.exitCode, result.stderr || result.stdout);
  }

  private async executeResearchTicket(ticket: Ticket, runId: string): Promise<TickResult> {
    const runner = selectRunner(ticket.runner, this.config.defaults.runner);
    const finalOutputPath = path.join(defaultStateDir(), "runs", runId, "final.json");
    const gatheredContext = await gatherResearchContext(this.config, ticket);
    const prompt = buildResearchPrompt(ticket, this.config, gatheredContext);
    const result = await runAgent({ runner, cwd: process.cwd(), prompt, ticket, finalOutputPath });
    return this.applyWorkerResult(ticket, runId, result.final, result.exitCode, result.stderr || result.stdout);
  }

  private async executeSplitTicket(ticket: Ticket, runId: string): Promise<TickResult> {
    const runner = selectRunner(ticket.runner, this.config.defaults.runner);
    const finalOutputPath = path.join(defaultStateDir(), "runs", runId, "final.json");
    const prompt = buildSplitPrompt(ticket);
    const result = await runAgent({ runner, cwd: process.cwd(), prompt, ticket, finalOutputPath });
    const final = result.final;
    if (final?.status === "planned" && final.children?.length) {
      for (const child of final.children) {
        await this.notion.createChildTicket(child, ticket.id);
      }
    }
    return this.applyWorkerResult(ticket, runId, final, result.exitCode, result.stderr || result.stdout);
  }

  private async applyWorkerResult(
    ticket: Ticket,
    runId: string,
    final: WorkerFinal | undefined,
    exitCode: number,
    diagnostics = ""
  ): Promise<TickResult> {
    if (!final) {
      const status: Status = exitCode === 0 ? "Review" : "Failed";
      const summary = exitCode === 0
        ? "Worker exited without a structured final response."
        : `Worker exited with code ${exitCode} and no structured final response. ${diagnostics.slice(0, 500)}`.trim();
      await this.notion.updateResult(ticket.id, { status, summary, runId });
      return { action: status === "Failed" ? "failed" : "completed", message: summary, ticket: summarizeTicket(ticket), status };
    }

    const status = mapWorkerStatus(final.status);
    if (!status) {
      const summary = `Worker returned an unrecognized status: ${String(final.status)}`;
      await this.notion.updateResult(ticket.id, { status: "Failed", summary, runId });
      return { action: "failed", message: summary, ticket: summarizeTicket(ticket), status: "Failed" };
    }
    const summary = final.summary || final.question || final.blocker || "Worker completed.";
    await this.notion.updateResult(ticket.id, {
      status,
      summary,
      prUrl: final.prUrl,
      outputUrl: normalizeOutputUrl(final.outputUrl),
      runId
    });

    if (final.question) await this.notion.comment(ticket.id, `Question:\n\n${final.question}`);
    if (final.blocker) await this.notion.comment(ticket.id, `Blocker:\n\n${final.blocker}`);

    return {
      action: status === "Failed" ? "failed" : "completed",
      message: summary,
      ticket: summarizeTicket(ticket),
      status
    };
  }

  private async needsInput(ticket: Ticket, message: string): Promise<TickResult> {
    if (!this.options.dryRun) {
      await this.notion.updateResult(ticket.id, {
        status: "Needs Josh",
        summary: message
      });
      await this.notion.comment(ticket.id, message);
    }
    return {
      action: "needs_input",
      message,
      ticket: summarizeTicket(ticket),
      status: "Needs Josh"
    };
  }
}

function mapWorkerStatus(status: WorkerFinal["status"] | undefined): Status | undefined {
  switch (status) {
    case "done":
      return "Done";
    case "review":
      return "Review";
    case "planned":
      return "Planned";
    case "needs_input":
      return "Needs Josh";
    case "blocked":
      return "Blocked";
    case "failed":
      return "Failed";
    default:
      return undefined;
  }
}

function summarizeTicket(ticket: Ticket): Pick<Ticket, "id" | "title" | "taskType"> {
  return { id: ticket.id, title: ticket.title, taskType: ticket.taskType };
}

function makeRunId(ticket: Ticket): string {
  const hash = crypto.createHash("sha1").update(`${ticket.id}:${Date.now()}`).digest("hex").slice(0, 10);
  return `run-${new Date().toISOString().replace(/[:.]/g, "-")}-${hash}`;
}

function normalizeOutputUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).href;
  } catch {
    const artifactPath = path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
    return pathToFileURL(artifactPath).href;
  }
}
