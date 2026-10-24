import type { Command } from "commander";
import { milestoneId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, table } from "../../core/output.js";
import { MilestoneService } from "../../services/milestone.service.js";
import { milestoneRows, toMilestoneView } from "./view.js";

export function registerClose(milestone: Command): void {
  milestone
    .command("close <milestone>")
    .description("Mark a milestone completed, e.g. M3; milestone reopen undoes it")
    .action(async (rawId: string, _opts: unknown, cmd: Command) => {
      const id = milestoneId(rawId);
      const { mode } = bootstrap(cmd);
      const view = toMilestoneView(await new MilestoneService().update(id, { is_completed: true }));
      printResult(mode, view, () =>
        [`Closed M${view.id}  ${view.name}`, table(milestoneRows(view))].join("\n\n"),
      );
    });
}
