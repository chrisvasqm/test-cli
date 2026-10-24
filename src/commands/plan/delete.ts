import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { planId } from "../../providers/testrail/ids.js";
import { registerDeleteAction } from "../action.js";

export function registerDelete(plan: Command): void {
  registerDeleteAction(plan, {
    usage: "delete <plan>",
    description: "Delete a plan with its runs, tests and results, e.g. R7; TestRail has no undo",
    parseId: planId,
    needs: "plans",
    service: () => provider().plans,
    key: "name",
    ref: (id) => `R${id}`,
    question: (id, found) =>
      `Delete plan R${id} "${found.name}" with its runs, tests and results? This cannot be undone.`,
  });
}
