import type { Command } from "commander";
import { runId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { MetaService } from "../../services/meta.service.js";
import { RunService } from "../../services/run.service.js";
import { isoTime, renderCounts, runCounts } from "../render.js";

interface CloseOptions {
  yes?: boolean;
}

export function registerClose(run: Command): void {
  run
    .command("close <run>")
    .description("Close a run, e.g. R3; TestRail cannot reopen it")
    .option("-y, --yes", "Close without asking")
    .action(async (rawId: string, opts: CloseOptions, cmd: Command) => {
      const id = runId(rawId);
      const { mode } = bootstrap(cmd);
      const runs = new RunService();
      const found = await runs.get(id);
      if (!opts.yes) await confirm(`Close R${id} "${found.name}"? It cannot be reopened.`);
      const [closed, statuses] = await Promise.all([runs.close(id), new MetaService().statuses()]);
      const view = {
        id: closed.id,
        name: closed.name,
        completed: closed.is_completed,
        completedOn: isoTime(closed.completed_on),
        counts: runCounts(closed, statuses),
        url: closed.url,
      };
      printResult(
        mode,
        view,
        () => `Closed R${view.id}  ${view.name}\n${renderCounts(view.counts)}\n${view.url}`,
      );
    });
}
