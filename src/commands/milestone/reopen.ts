import type { Command } from "commander";
import { milestoneId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, table } from "../../core/output.js";
import { MilestoneService } from "../../services/milestone.service.js";
import { milestoneRows, toMilestoneView } from "./view.js";

export function registerReopen(milestone: Command): void {
  milestone
    .command("reopen <milestone>")
    .description("Mark a completed milestone open again, e.g. M3")
    .action(async (rawId: string, _opts: unknown, cmd: Command) => {
      const id = milestoneId(rawId);
      const { mode } = bootstrap(cmd);
      const view = toMilestoneView(await new MilestoneService().update(id, { is_completed: false }));
      printResult(mode, view, () =>
        [`Reopened M${view.id}  ${view.name}`, table(milestoneRows(view))].join("\n\n"),
      );
    });
}
