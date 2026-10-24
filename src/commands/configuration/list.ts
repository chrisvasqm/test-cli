import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { bootstrap } from "../../core/bootstrap.js";
import { grid, printResult } from "../../core/output.js";

interface ConfigRow {
  id: number;
  name: string;
}

export function registerList(configuration: Command): void {
  configuration
    .command("list")
    .description("List configuration groups and their configurations in the project")
    .action(async (_opts: unknown, cmd: Command) => {
      const { config, mode } = bootstrap(cmd, "configurations");
      const found = await provider().configurations.groups(config.projectId);
      const groups = found.map((group) => ({
        id: group.id,
        name: group.name,
        configs: group.configs.map((item): ConfigRow => ({ id: item.id, name: item.name })),
      }));
      printResult(mode, { groups }, () =>
        groups.length === 0
          ? "No configurations."
          : groups.map((group) => `${group.name}\n${renderConfigs(group.configs)}`).join("\n\n"),
      );
    });
}

/** Indented "id  name" lines under a group name. */
function renderConfigs(configs: ConfigRow[]): string {
  if (configs.length === 0) return "  (none)";
  return grid(configs.map((item) => [`  ${item.id}`, item.name]));
}
