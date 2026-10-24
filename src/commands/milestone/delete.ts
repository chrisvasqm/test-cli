import type { Command } from "commander";
import { milestoneId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { MilestoneService } from "../../services/milestone.service.js";

interface DeleteOptions {
  yes?: boolean;
}

export function registerDelete(milestone: Command): void {
  milestone
    .command("delete <milestone>")
    .description("Delete a milestone, e.g. M3; TestRail has no undo")
    .option("-y, --yes", "Delete without asking")
    .action(async (rawId: string, opts: DeleteOptions, cmd: Command) => {
      const id = milestoneId(rawId);
      const { mode } = bootstrap(cmd);
      const milestones = new MilestoneService();
      const found = await milestones.get(id);
      if (!opts.yes) await confirm(`Delete M${id} "${found.name}"? This cannot be undone.`);
      await milestones.remove(id);
      printResult(mode, { id, name: found.name, deleted: true }, () => `Deleted M${id}  ${found.name}`);
    });
}
