import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { suiteId } from "../../providers/testrail/ids.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, table } from "../../core/output.js";

export function registerView(suite: Command): void {
  suite
    .command("view <suite>")
    .description("Show a suite's details, e.g. S3")
    .action(async (rawId: string, _opts: unknown, cmd: Command) => {
      const id = suiteId(rawId);
      const { config, mode } = bootstrap(cmd, "suites");
      const found = await provider().suites.get(id);
      const view = {
        id: found.id,
        name: found.name,
        description: found.description,
        projectId: found.project_id,
        completed: found.is_completed ?? false,
        current: found.id === config.suiteId,
        url: found.url,
      };
      printResult(mode, view, () => {
        const rows: [string, string][] = [
          ["Project", `P${view.projectId}`],
          ["State", view.completed ? "completed" : "active"],
          ["Default", view.current ? "yes" : "no"],
          ["URL", view.url],
        ];
        const sections = [`S${view.id}  ${view.name}`, table(rows)];
        if (view.description) sections.push(`Description\n\n${view.description}`);
        return sections.join("\n\n");
      });
    });
}
