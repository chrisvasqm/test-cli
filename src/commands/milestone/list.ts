import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { listLimit } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, renderList } from "../../core/output.js";
import { isoTime, localDate } from "../render.js";

interface ListOptions {
  completed?: boolean;
  limit: string;
}

export function registerList(milestone: Command): void {
  milestone
    .command("list")
    .description("List open milestones in the project")
    .option("-cp, --completed", "List completed milestones instead")
    .option("-n, --limit <n>", "Most milestones to show", "25")
    .action(async (opts: ListOptions, cmd: Command) => {
      const limit = listLimit(opts.limit);
      const { config, mode } = bootstrap(cmd);
      const { items, hasMore } = await provider().milestones.list(
        config.projectId,
        Boolean(opts.completed),
        limit,
      );
      const milestones = items.map((item) => ({
        id: item.id,
        name: item.name,
        parentId: item.parent_id,
        due: isoTime(item.due_on),
        completed: item.is_completed,
        url: item.url,
      }));
      printResult(mode, { milestones, hasMore }, () =>
        renderList(
          milestones.map((item) => [
            `M${item.id}`,
            item.name,
            `due ${localDate(item.due)}`,
            item.completed ? "completed" : "open",
          ]),
          opts.completed ? "No completed milestones." : "No open milestones.",
          hasMore,
        ),
      );
    });
}
