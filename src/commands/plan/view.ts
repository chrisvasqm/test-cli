import type { Command } from "commander";
import { planId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, table } from "../../core/output.js";
import type { Plan, Status } from "../../core/testrail-types.js";
import { MetaService } from "../../services/meta.service.js";
import { PlanService } from "../../services/plan.service.js";
import { localTime, renderCounts } from "../render.js";
import { renderEntry, toEntryView, toPlanSummary } from "./render.js";

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

export function registerView(plan: Command): void {
  plan
    .command("view <plan>")
    .description("Show a plan's progress and its runs, e.g. R7 (a run's tests: test list R8)")
    .action(async (rawId: string, _opts: unknown, cmd: Command) => {
      const id = planId(rawId);
      const { mode } = bootstrap(cmd);
      const [found, statuses] = await Promise.all([new PlanService().get(id), new MetaService().statuses()]);
      const view = toPlanView(found, statuses);
      printResult(mode, view, () => renderPlan(view));
    });
}
