import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { milestoneId } from "../../providers/testrail/ids.js";
import { table } from "../../core/output.js";
import { registerIdAction } from "../action.js";
import { milestoneRows, toMilestoneView } from "./render.js";

export function registerReopen(milestone: Command): void {
  registerIdAction(milestone, {
    usage: "reopen <milestone>",
    description: "Mark a completed milestone open again, e.g. M3",
    parseId: milestoneId,
    prepare: () => provider().milestones,
    act: async (id, milestones) => toMilestoneView(await milestones.update(id, { is_completed: false })),
    render: (view) => [`Reopened M${view.id}  ${view.name}`, table(milestoneRows(view))].join("\n\n"),
  });
}
