import type { Command } from "commander";
import { listLimit } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { grid, moreHint, printResult } from "../../core/output.js";
import { MetaService } from "../../services/meta.service.js";
import { RunService } from "../../services/run.service.js";
import { isoTime, renderCounts, runCounts } from "../render.js";

interface ListOptions {
  completed?: boolean;
  limit: string;
}

export function registerList(run: Command): void {
  run
    .command("list")
    .description("List open runs in the project, newest first")
    .option("--completed", "List closed runs instead")
    .option("--limit <n>", "Most runs to show", "25")
    .action(async (opts: ListOptions, cmd: Command) => {
      const limit = listLimit(opts.limit);
      const { config, mode } = bootstrap(cmd);
      const [{ items, hasMore }, statuses] = await Promise.all([
        new RunService().list(config.projectId, Boolean(opts.completed), limit),
        new MetaService().statuses(),
      ]);
      const runs = items.map((item) => ({
        id: item.id,
        name: item.name,
        completed: item.is_completed,
        planId: item.plan_id,
        counts: runCounts(item, statuses),
        created: isoTime(item.created_on),
        url: item.url,
      }));
      printResult(mode, { runs, hasMore }, () =>
        runs.length === 0
          ? opts.completed
            ? "No closed runs."
            : "No open runs."
          : grid(runs.map((item) => [`R${item.id}`, item.name, renderCounts(item.counts)])) +
            moreHint(runs.length, hasMore),
      );
    });
}
