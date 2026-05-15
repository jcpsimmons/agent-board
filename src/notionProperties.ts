import { ChildTicket, NotionPage, RunnerName, Status, TaskType, Ticket } from "./types.js";
import { RUNNERS, STATUSES, TASK_TYPES } from "./types.js";

export function pageToTicket(page: NotionPage): Ticket {
  const props = page.properties ?? {};
  const title = getTextProperty(props.Title) || getTextProperty(props.Name) || "Untitled";
  const prompt = getTextProperty(props.Prompt) || title;
  const status = asStatus(getNameProperty(props.Status));
  const taskType = asTaskType(getNameProperty(props["Task Type"])) ?? inferTaskType(`${title}\n${prompt}`);
  const runner = asRunner(getNameProperty(props.Runner));
  const priority = getNumberProperty(props.Priority) ?? 3;
  const repoHint = getTextProperty(props["Repo Hint"]);
  const parentId = getRelationFirstId(props.Parent);

  return {
    id: page.id,
    url: page.url,
    title,
    status,
    taskType,
    priority,
    runner,
    repoHint,
    prompt,
    parentId,
    raw: page
  };
}

export function inferTaskType(text: string): TaskType | undefined {
  const normalized = text.toLowerCase();
  const codeSignals = ["repo", "pr", "pull request", "branch", "test", "fix", "implement", "feature"];
  const docSignals = ["doc", "architecture", "research", "summarize", "granola", "slack", "notion"];
  const splitSignals = ["multiple features", "split", "break down", "decompose", "several features"];

  if (splitSignals.some((signal) => normalized.includes(signal))) return "Plan/Split";
  if (codeSignals.some((signal) => normalized.includes(signal))) return "Code";
  if (docSignals.some((signal) => normalized.includes(signal))) return "Research Doc";
  return undefined;
}

export function statusProperty(status: Status): Record<string, unknown> {
  return { status: { name: status } };
}

export function selectProperty(name: string): Record<string, unknown> {
  return { select: { name } };
}

export function titleProperty(text: string): Record<string, unknown> {
  return { title: [{ text: { content: text } }] };
}

export function richTextProperty(text: string): Record<string, unknown> {
  return { rich_text: [{ text: { content: text.slice(0, 1900) } }] };
}

export function urlProperty(url?: string): Record<string, unknown> {
  return url ? { url } : { url: null };
}

export function numberProperty(value: number): Record<string, unknown> {
  return { number: value };
}

export function dateProperty(date: Date): Record<string, unknown> {
  return { date: { start: date.toISOString() } };
}

export function relationProperty(pageId?: string): Record<string, unknown> {
  return pageId ? { relation: [{ id: pageId }] } : { relation: [] };
}

export function childTicketProperties(child: ChildTicket, parentId?: string): Record<string, unknown> {
  return {
    Title: titleProperty(child.title),
    Status: statusProperty("Ready"),
    "Task Type": selectProperty(child.taskType),
    Priority: numberProperty(child.priority ?? 3),
    Prompt: richTextProperty(child.prompt),
    "Repo Hint": richTextProperty(child.repoHint ?? ""),
    Runner: selectProperty(child.runner ?? "codex"),
    Parent: relationProperty(parentId)
  };
}

function getTextProperty(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.plain_text === "string") return candidate.plain_text;
  for (const key of ["title", "rich_text"]) {
    const rich = candidate[key];
    if (Array.isArray(rich)) {
      return rich
        .map((item) => {
          if (item && typeof item === "object") {
            const itemRecord = item as Record<string, unknown>;
            if (typeof itemRecord.plain_text === "string") return itemRecord.plain_text;
            const text = itemRecord.text;
            if (text && typeof text === "object" && typeof (text as Record<string, unknown>).content === "string") {
              return (text as Record<string, unknown>).content;
            }
          }
          return "";
        })
        .join("")
        .trim();
    }
  }
  if (typeof candidate.url === "string") return candidate.url;
  return undefined;
}

function getNameProperty(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  for (const key of ["status", "select"]) {
    const named = candidate[key];
    if (named && typeof named === "object" && typeof (named as Record<string, unknown>).name === "string") {
      return (named as Record<string, unknown>).name as string;
    }
  }
  if (typeof candidate.name === "string") return candidate.name;
  return undefined;
}

function getNumberProperty(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.number === "number" ? candidate.number : undefined;
}

function getRelationFirstId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const relation = (value as Record<string, unknown>).relation;
  if (!Array.isArray(relation)) return undefined;
  const first = relation[0];
  if (first && typeof first === "object" && typeof (first as Record<string, unknown>).id === "string") {
    return (first as Record<string, unknown>).id as string;
  }
  return undefined;
}

function asStatus(value?: string): Status | undefined {
  return STATUSES.includes(value as Status) ? (value as Status) : undefined;
}

function asTaskType(value?: string): TaskType | undefined {
  return TASK_TYPES.includes(value as TaskType) ? (value as TaskType) : undefined;
}

function asRunner(value?: string): RunnerName | undefined {
  return RUNNERS.includes(value as RunnerName) ? (value as RunnerName) : undefined;
}
