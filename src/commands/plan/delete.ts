import type { Command } from "commander";
import { planId } from "../../core/args.js";
import { PlanService } from "../../services/plan.service.js";
import { registerDeleteAction } from "../action.js";

export function registerDelete(plan: Command): void {
  registerDeleteAction(plan, {
    usage: "delete <plan>",
    description: "Delete a plan with its runs, tests and results, e.g. R7; TestRail has no undo",
    parseId: planId,
    service: () => new PlanService(),
    key: "name",
    ref: (id) => `R${id}`,
    question: (id, found) =>
      `Delete plan R${id} "${found.name}" with its runs, tests and results? This cannot be undone.`,
  });
}
