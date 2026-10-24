import type { Command } from "commander";
import { planId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { MetaService } from "../../services/meta.service.js";
import { PlanService } from "../../services/plan.service.js";
import { renderPlan, toPlanView } from "./view.js";

interface CloseOptions {
  yes?: boolean;
}

export function registerClose(plan: Command): void {
  plan
    .command("close <plan>")
    .description("Close a plan and its runs, e.g. R7; TestRail cannot reopen it")
    .option("-y, --yes", "Close without asking")
    .action(async (rawId: string, opts: CloseOptions, cmd: Command) => {
      const id = planId(rawId);
      const { mode } = bootstrap(cmd);
      const plans = new PlanService();
      const statuses = new MetaService().statuses();
      if (!opts.yes) {
        const found = await plans.get(id);
        await confirm(`Close plan R${id} "${found.name}" and its runs? It cannot be reopened.`);
      }
      // Statuses before the write: a failed lookup after it would hide that the plan was closed.
      const counted = await statuses;
      const view = toPlanView(await plans.close(id), counted);
      printResult(mode, view, () => renderPlan(view, "Closed"));
    });
}
