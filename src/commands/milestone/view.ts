import type { Command } from "commander";
import { milestoneId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, table } from "../../core/output.js";
import { MilestoneService } from "../../services/milestone.service.js";
import { milestoneRows, toMilestoneView } from "./render.js";

export function registerView(milestone: Command): void {
  milestone
    .command("view <milestone>")
    .description("Show a milestone's dates, parent, refs and description, e.g. M3")
    .action(async (rawId: string, _opts: unknown, cmd: Command) => {
      const id = milestoneId(rawId);
      const { mode } = bootstrap(cmd);
      const view = toMilestoneView(await new MilestoneService().get(id));
      printResult(mode, view, () => {
        const sections = [`M${view.id}  ${view.name}`, table(milestoneRows(view))];
        if (view.description) sections.push(`Description\n\n${view.description}`);
        return sections.join("\n\n");
      });
    });
}
