import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { milestoneId } from "../../providers/testrail/ids.js";
import { registerDeleteAction } from "../action.js";

export function registerDelete(milestone: Command): void {
  registerDeleteAction(milestone, {
    usage: "delete <milestone>",
    description: "Delete a milestone, e.g. M3; TestRail has no undo",
    parseId: milestoneId,
    needs: "milestones",
    service: () => provider().milestones,
    key: "name",
    ref: (id) => `M${id}`,
    question: (id, found) => `Delete M${id} "${found.name}"? This cannot be undone.`,
  });
}
