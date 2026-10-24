import type { Config } from "../core/config.js";
import { splitList } from "../core/text.js";
import type { CaseContent, Result, Run, Status, StepInput } from "../core/testrail-types.js";
import { nameOf } from "../services/meta.service.js";

const LOCAL_TIME = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZoneName: "shortOffset",
});

/** TestRail timestamps are Unix seconds; JSON output gets ISO strings. */
export function isoTime(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null;
  return new Date(seconds * 1000).toISOString();
}

/** Local time, e.g. "2026-10-23 14:05 GMT-4". */
export function localTime(iso: string | null): string {
  if (iso === null) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const part = Object.fromEntries(LOCAL_TIME.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${part["year"]}-${part["month"]}-${part["day"]} ${part["hour"]}:${part["minute"]} ${part["timeZoneName"]}`;
}

export const caseUrl = (config: Config, id: number): string =>
  `${config.baseUrl}/index.php?/cases/view/${id}`;
export const testUrl = (config: Config, id: number): string =>
  `${config.baseUrl}/index.php?/tests/view/${id}`;

export interface ContentView {
  preconditions: string | null;
  /** Text-template steps; null when the case uses separated steps. */
  steps: string | null;
  expected: string | null;
  /** Steps-template steps, in order. */
  stepList: StepInput[];
}

export function toContent(item: CaseContent): ContentView {
  return {
    preconditions: item.custom_preconds ?? null,
    steps: item.custom_steps ?? null,
    expected: item.custom_expected ?? null,
    stepList: (item.custom_steps_separated ?? []).map((step) => ({
      content: step.content ?? "",
      expected: step.expected ?? "",
    })),
  };
}

export function renderContent(content: ContentView): string[] {
  const sections: string[] = [];
  if (content.preconditions) sections.push(`Preconditions\n\n${content.preconditions}`);
  if (content.stepList.length > 0) {
    const steps = content.stepList.map(
      (step, index) =>
        `${index + 1}. ${step.content}${step.expected ? `\n   Expected: ${step.expected}` : ""}`,
    );
    sections.push(`Steps\n\n${steps.join("\n")}`);
  }
  if (content.steps) sections.push(`Steps\n\n${content.steps}`);
  if (content.expected) sections.push(`Expected\n\n${content.expected}`);
  return sections;
}

const LAST_SYSTEM_STATUS = 5;

/** Counts per status label, only for statuses that have tests ("Passed 3, Failed 1"). */
export function runCounts(run: Run, statuses: Status[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const status of statuses) {
    // System statuses (ids 1-5) have <name>_count; custom ids 6-12 are custom_status1..7_count.
    const field =
      status.id <= LAST_SYSTEM_STATUS
        ? `${status.name}_count`
        : `custom_status${status.id - LAST_SYSTEM_STATUS}_count`;
    const value = (run as unknown as Record<string, unknown>)[field];
    if (typeof value === "number" && value > 0) counts[status.label] = value;
  }
  return counts;
}

export function renderCounts(counts: Record<string, number>): string {
  const parts = Object.entries(counts).map(([label, count]) => `${label} ${count}`);
  return parts.length > 0 ? parts.join(", ") : "no tests";
}

export interface ResultView {
  id: number;
  status: string | null;
  comment: string | null;
  defects: string[];
  elapsed: string | null;
  version: string | null;
  created: string | null;
}

export function toResult(result: Result, statuses: Status[]): ResultView {
  return {
    id: result.id,
    status: nameOf(statuses, result.status_id),
    comment: result.comment,
    defects: splitList(result.defects),
    elapsed: result.elapsed,
    version: result.version,
    created: isoTime(result.created_on),
  };
}

/** "Failed · 2026-10-23 14:05 GMT-4 · defects KAN-2" followed by the comment. */
export function renderResult(result: ResultView): string {
  const head = [result.status ?? "Comment", localTime(result.created)];
  if (result.elapsed) head.push(result.elapsed);
  if (result.defects.length > 0) head.push(`defects ${result.defects.join(", ")}`);
  return result.comment ? `${head.join(" · ")}\n${result.comment}` : head.join(" · ");
}

/** The fields every run output shares; commands add what they need. */
export function toRunSummary(run: Run, statuses: Status[]) {
  return {
    id: run.id,
    name: run.name,
    url: run.url,
    completed: run.is_completed,
    completedOn: isoTime(run.completed_on),
    counts: runCounts(run, statuses),
  };
}

/** What setup and project use print after saving the config: the same data and rows for both. */
export function savedConfig(
  path: string,
  project: { id: number; name: string },
  suite: { id: number; name: string } | undefined,
) {
  const rows: [string, string][] = [
    ["Config", path],
    ["Project", `${project.name} (P${project.id})`],
  ];
  if (suite) rows.push(["Suite", `${suite.name} (S${suite.id})`]);
  const data = {
    path,
    project: { id: project.id, name: project.name },
    suite: suite ? { id: suite.id, name: suite.name } : null,
  };
  return { data, rows };
}
