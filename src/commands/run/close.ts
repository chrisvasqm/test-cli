import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { runId } from "../../providers/testrail/ids.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { renderCounts, toRunSummary } from "../render.js";

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
      const runs = provider().runs;
      const statuses = provider().meta.statuses();
      const found = await runs.get(id);
      // A run in a plan fails here, before the question.
      runs.assertClosable(found);
      if (!opts.yes) await confirm(`Close R${id} "${found.name}"? It cannot be reopened.`);
      // Statuses before the write: a failed lookup after it would hide that the run was closed.
      const counted = await statuses;
      const view = toRunSummary(await runs.close(id, found), counted);
      printResult(
        mode,
        view,
        () => `Closed R${view.id}  ${view.name}\n${renderCounts(view.counts)}\n${view.url}`,
      );
    });
}
