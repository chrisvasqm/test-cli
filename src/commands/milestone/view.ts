import type { Command } from "commander";
import { milestoneId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, table } from "../../core/output.js";
import { splitList } from "../../core/text.js";
import type { Milestone } from "../../core/testrail-types.js";
import { MilestoneService } from "../../services/milestone.service.js";
import { isoTime, localDate, localTime } from "../render.js";

/** The milestone fields view and create print. */
export function toMilestoneView(found: Milestone) {
  return {
    id: found.id,
    name: found.name,
    url: found.url,
    description: found.description,
    parentId: found.parent_id,
    refs: splitList(found.refs),
    start: isoTime(found.start_on),
    due: isoTime(found.due_on),
    started: found.is_started,
    completed: found.is_completed,
    completedOn: isoTime(found.completed_on),
  };
}

/** Key/value rows for a milestone; the caller adds the heading and description. */
export function milestoneRows(view: ReturnType<typeof toMilestoneView>): [string, string][] {
  const rows: [string, string][] = [
    ["State", view.completed ? `completed ${localTime(view.completedOn)}` : "open"],
    ["Start", localDate(view.start)],
    ["Due", localDate(view.due)],
  ];
  if (view.parentId !== null) rows.push(["Parent", `M${view.parentId}`]);
  if (view.refs.length > 0) rows.push(["Refs", view.refs.join(", ")]);
  rows.push(["URL", view.url]);
  return rows;
}

export function registerView(milestone: Command): void {
  milestone
    .command("view <milestone>")
    .description("Show a milestone's dates, parent, refs and description, e.g. M3")
    .action(async (rawId: string, _opts: unknown, cmd: Command) => {
      const id = milestoneId(rawId);
      const { mode } = bootstrap(cmd);
      const view = toMilestoneView(await new MilestoneService().get(id));
      printResult(mode, view, () => {
        const sections = [`M${view.id}  ${view.name}`, table(milestoneRows(view))];
        if (view.description) sections.push(`Description\n\n${view.description}`);
        return sections.join("\n\n");
      });
    });
}
