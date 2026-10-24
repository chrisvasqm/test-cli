import type { Command } from "commander";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, renderList } from "../../core/output.js";
import { SUITE_MODE_SINGLE } from "../../core/testrail-types.js";
import { ProjectService } from "../../services/project.service.js";

export function registerList(project: Command): void {
  project
    .command("list")
    .description("List active projects; * marks the one in the config")
    .action(async (_opts: unknown, cmd: Command) => {
      const { config, mode } = bootstrap(cmd);
      const { items, hasMore } = await new ProjectService().listActive();
      const projects = items.map((item) => ({
        id: item.id,
        name: item.name,
        multiSuite: item.suite_mode !== SUITE_MODE_SINGLE,
        current: item.id === config.projectId,
        url: item.url,
      }));
      printResult(mode, { projects, hasMore }, () =>
        renderList(
          projects.map((item) => [item.current ? "*" : " ", `P${item.id}`, item.name]),
          "No active projects.",
          hasMore,
        ),
      );
    });
}
