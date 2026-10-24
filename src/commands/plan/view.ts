import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { planId } from "../../providers/testrail/ids.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult } from "../../core/output.js";
import { renderPlan, toPlanView } from "./render.js";

export function registerView(plan: Command): void {
  plan
    .command("view <plan>")
    .description("Show a plan's progress and its runs, e.g. R7 (a run's tests: test list R8)")
    .action(async (rawId: string, _opts: unknown, cmd: Command) => {
      const id = planId(rawId);
      const { mode } = bootstrap(cmd, "plans");
      const [found, statuses] = await Promise.all([provider().plans.get(id), provider().meta.statuses()]);
      const view = toPlanView(found, statuses);
      printResult(mode, view, () => renderPlan(view));
    });
}
