import type { Command } from "commander";
import { milestoneId } from "../../core/args.js";
import { MilestoneService } from "../../services/milestone.service.js";
import { registerDeleteAction } from "../action.js";

export function registerDelete(milestone: Command): void {
  registerDeleteAction(milestone, {
    usage: "delete <milestone>",
    description: "Delete a milestone, e.g. M3; TestRail has no undo",
    parseId: milestoneId,
    service: () => new MilestoneService(),
    key: "name",
    ref: (id) => `M${id}`,
    question: (id, found) => `Delete M${id} "${found.name}"? This cannot be undone.`,
  });
}
