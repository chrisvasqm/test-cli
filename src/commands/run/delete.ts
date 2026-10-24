import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { runId } from "../../providers/testrail/ids.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";

interface DeleteOptions {
  yes?: boolean;
}

export function registerDelete(run: Command): void {
  run
    .command("delete <run>")
    .description("Delete a run with its tests and results, e.g. R3; TestRail has no undo")
    .option("-y, --yes", "Delete without asking")
    .action(async (rawId: string, opts: DeleteOptions, cmd: Command) => {
      const id = runId(rawId);
      const { mode } = bootstrap(cmd);
      const runs = provider().runs;
      const found = await runs.get(id);
      if (!opts.yes) {
        await confirm(`Delete R${id} "${found.name}" with its tests and results? This cannot be undone.`);
      }
      await runs.remove(id);
      printResult(mode, { id, name: found.name, deleted: true }, () => `Deleted R${id}  ${found.name}`);
    });
}
