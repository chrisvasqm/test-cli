import type { Command } from "commander";
import { listLimit } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, renderList } from "../../core/output.js";
import { MetaService } from "../../services/meta.service.js";
import { RunService } from "../../services/run.service.js";
import { isoTime, renderCounts, toRunSummary } from "../render.js";

interface ListOptions {
  completed?: boolean;
  limit: string;
}

export function registerList(run: Command): void {
  run
    .command("list")
    .description("List open runs in the project, newest first")
    .option("-cp, --completed", "List closed runs instead")
    .option("-n, --limit <n>", "Most runs to show", "25")
    .action(async (opts: ListOptions, cmd: Command) => {
      const limit = listLimit(opts.limit);
      const { config, mode } = bootstrap(cmd);
      const [{ items, hasMore }, statuses] = await Promise.all([
        new RunService().list(config.projectId, limit, { completed: Boolean(opts.completed) }),
        new MetaService().statuses(),
      ]);
      const runs = items.map((item) => ({
        ...toRunSummary(item, statuses),
        planId: item.plan_id,
        created: isoTime(item.created_on),
      }));
      printResult(mode, { runs, hasMore }, () =>
        renderList(
          runs.map((item) => [`R${item.id}`, item.name, renderCounts(item.counts)]),
          opts.completed ? "No closed runs." : "No open runs.",
          hasMore,
        ),
      );
    });
}
