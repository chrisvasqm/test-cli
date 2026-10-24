import type { Command } from "commander";
import { planId } from "../../core/args.js";
import { MetaService } from "../../services/meta.service.js";
import { PlanService } from "../../services/plan.service.js";
import { registerIdAction } from "../action.js";
import { renderPlan, toPlanView } from "./render.js";

export function registerClose(plan: Command): void {
  registerIdAction(plan, {
    usage: "close <plan>",
    description: "Close a plan and its runs, e.g. R7; TestRail cannot reopen it",
    parseId: planId,
    confirm: {
      yesHelp: "Close without asking",
      question: async (id, { plans }) => {
        const found = await plans.get(id);
        return `Close plan R${id} "${found.name}" and its runs? It cannot be reopened.`;
      },
    },
    prepare: () => ({ plans: new PlanService(), statuses: new MetaService().statuses() }),
    act: async (id, { plans, statuses }) => {
      // Statuses before the write: a failed lookup after it would hide that the plan was closed.
      const counted = await statuses;
      return toPlanView(await plans.close(id), counted);
    },
    render: (view) => renderPlan(view, "Closed"),
  });
}
