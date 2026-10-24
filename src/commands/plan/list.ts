import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { listLimit } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, renderList } from "../../core/output.js";
import { renderCounts } from "../render.js";
import { toPlanSummary } from "./render.js";

interface ListOptions {
  completed?: boolean;
  limit: string;
}

export function registerList(plan: Command): void {
  plan
    .command("list")
    .description("List open test plans in the project, newest first")
    .option("-cp, --completed", "List closed plans instead")
    .option("-n, --limit <n>", "Most plans to show", "25")
    .action(async (opts: ListOptions, cmd: Command) => {
      const limit = listLimit(opts.limit);
      const { config, mode } = bootstrap(cmd, "plans");
      const [{ items, hasMore }, statuses] = await Promise.all([
        provider().plans.list(config.projectId, Boolean(opts.completed), limit),
        provider().meta.statuses(),
      ]);
      const plans = items.map((item) => toPlanSummary(item, statuses));
      printResult(mode, { plans, hasMore }, () =>
        renderList(
          plans.map((item) => [`R${item.id}`, item.name, renderCounts(item.counts)]),
          opts.completed ? "No closed plans." : "No open plans.",
          hasMore,
        ),
      );
    });
}
