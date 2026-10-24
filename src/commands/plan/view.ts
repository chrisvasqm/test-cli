import type { Command } from "commander";
import { planId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult } from "../../core/output.js";
import { MetaService } from "../../services/meta.service.js";
import { PlanService } from "../../services/plan.service.js";
import { renderPlan, toPlanView } from "./render.js";

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
