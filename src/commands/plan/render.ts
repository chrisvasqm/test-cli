import { grid } from "../../core/output.js";
import type { Plan, PlanEntry, Status } from "../../core/testrail-types.js";
import { isoTime, renderCounts, runCounts, toRunSummary } from "../render.js";

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
