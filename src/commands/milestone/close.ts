import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { milestoneId } from "../../providers/testrail/ids.js";
import { table } from "../../core/output.js";
import { registerIdAction } from "../action.js";
import { milestoneRows, toMilestoneView } from "./render.js";

export function registerClose(milestone: Command): void {
  registerIdAction(milestone, {
    usage: "close <milestone>",
    description: "Mark a milestone completed, e.g. M3; milestone reopen undoes it",
    parseId: milestoneId,
    prepare: () => provider().milestones,
    act: async (id, milestones) => toMilestoneView(await milestones.update(id, { is_completed: true })),
    render: (view) => [`Closed M${view.id}  ${view.name}`, table(milestoneRows(view))].join("\n\n"),
  });
}
