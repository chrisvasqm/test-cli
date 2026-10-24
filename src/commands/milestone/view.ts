import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { milestoneId } from "../../providers/testrail/ids.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, table } from "../../core/output.js";
import { milestoneRows, toMilestoneView } from "./render.js";

export function registerView(milestone: Command): void {
  milestone
    .command("view <milestone>")
    .description("Show a milestone's dates, parent, refs and description, e.g. M3")
    .action(async (rawId: string, _opts: unknown, cmd: Command) => {
      const id = milestoneId(rawId);
      const { mode } = bootstrap(cmd, "milestones");
      const view = toMilestoneView(await provider().milestones.get(id));
      printResult(mode, view, () => {
        const sections = [`M${view.id}  ${view.name}`, table(milestoneRows(view))];
        if (view.description) sections.push(`Description\n\n${view.description}`);
        return sections.join("\n\n");
      });
    });
}
