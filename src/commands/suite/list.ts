import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, renderList } from "../../core/output.js";

export function registerList(suite: Command): void {
  suite
    .command("list")
    .description("List the suites in the project from the config; * marks the one in the config")
    .action(async (_opts: unknown, cmd: Command) => {
      const { config, mode } = bootstrap(cmd);
      const found = await provider().projects.suites(config.projectId);
      const suites = found.map((item) => ({
        id: item.id,
        name: item.name,
        completed: item.is_completed ?? false,
        current: item.id === config.suiteId,
        url: item.url,
      }));
      printResult(mode, { suites }, () =>
        renderList(
          suites.map((item) => [
            item.current ? "*" : " ",
            `S${item.id}`,
            item.completed ? `${item.name} (completed)` : item.name,
          ]),
          "No suites.",
          false,
        ),
      );
    });
}
