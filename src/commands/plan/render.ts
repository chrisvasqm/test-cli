import { grid, table } from "../../core/output.js";
import type { Plan, PlanEntry, Status } from "../../core/testrail-types.js";
import { isoTime, localTime, renderCounts, runCounts, toRunSummary } from "../render.js";

/** The fields every plan output shares; commands add what they need. */
export function toPlanSummary(plan: Plan, statuses: Status[]) {
  return {
    id: plan.id,
    name: plan.name,
    url: plan.url,
    milestoneId: plan.milestone_id,
    completed: plan.is_completed,
    completedOn: isoTime(plan.completed_on),
    created: isoTime(plan.created_on),
    counts: runCounts(plan, statuses),
  };
}

export function toEntryView(entry: PlanEntry, statuses: Status[]) {
  return {
    id: entry.id,
    name: entry.name,
    suiteId: entry.suite_id,
    runs: entry.runs.map((run) => ({
      ...toRunSummary(run, statuses),
      config: run.config,
      configIds: run.config_ids,
    })),
  };
}

/** The entry's name and suite, then one indented row per run: id, configuration (or name), progress. */
export function renderEntry(entry: ReturnType<typeof toEntryView>): string {
  const rows = entry.runs.map((run) => [`  R${run.id}`, run.config ?? run.name, renderCounts(run.counts)]);
  return `${entry.name} (S${entry.suiteId})\n${grid(rows)}`;
}

/** The plan fields view, create and close print. */
export function toPlanView(found: Plan, statuses: Status[]) {
  return {
    ...toPlanSummary(found, statuses),
    description: found.description,
    entries: (found.entries ?? []).map((entry) => toEntryView(entry, statuses)),
  };
}

/** "<verb> R7  name", key/value rows, the entries with their runs, and the description. */
export function renderPlan(view: ReturnType<typeof toPlanView>, verb?: string): string {
  const rows: [string, string][] = [
    ["State", view.completed ? `closed ${localTime(view.completedOn)}` : "open"],
    ["Tests", renderCounts(view.counts)],
  ];
  if (view.milestoneId !== null) rows.push(["Milestone", `M${view.milestoneId}`]);
  rows.push(["Created", localTime(view.created)], ["URL", view.url]);
  const sections = [`${verb ? `${verb} ` : ""}R${view.id}  ${view.name}`, table(rows)];
  sections.push(view.entries.length > 0 ? view.entries.map(renderEntry).join("\n\n") : "No runs yet.");
  if (view.description) sections.push(`Description\n\n${view.description}`);
  return sections.join("\n\n");
}
