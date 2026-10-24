import type { Command } from "commander";
import { planId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { PlanService } from "../../services/plan.service.js";

interface DeleteOptions {
  yes?: boolean;
}

export function registerDelete(plan: Command): void {
  plan
    .command("delete <plan>")
    .description("Delete a plan with its runs, tests and results, e.g. R7; TestRail has no undo")
    .option("-y, --yes", "Delete without asking")
    .action(async (rawId: string, opts: DeleteOptions, cmd: Command) => {
      const id = planId(rawId);
      const { mode } = bootstrap(cmd);
      const plans = new PlanService();
      const found = await plans.get(id);
      if (!opts.yes) {
        await confirm(
          `Delete plan R${id} "${found.name}" with its runs, tests and results? This cannot be undone.`,
        );
      }
      await plans.remove(id);
      printResult(mode, { id, name: found.name, deleted: true }, () => `Deleted R${id}  ${found.name}`);
    });
}
