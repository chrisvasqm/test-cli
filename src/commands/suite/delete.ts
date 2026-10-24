import type { Command } from "commander";
import { suiteId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { SuiteService } from "../../services/suite.service.js";

interface DeleteOptions {
  yes?: boolean;
}

export function registerDelete(suite: Command): void {
  suite
    .command("delete <suite>")
    .description("Delete a suite with its sections, cases and tests, e.g. S3; TestRail has no undo")
    .option("-y, --yes", "Delete without asking")
    .action(async (rawId: string, opts: DeleteOptions, cmd: Command) => {
      const id = suiteId(rawId);
      const { mode } = bootstrap(cmd);
      const suites = new SuiteService();
      const found = await suites.get(id);
      if (!opts.yes) {
        await confirm(
          `Delete S${id} "${found.name}" with all its sections, cases and tests? This cannot be undone.`,
        );
      }
      await suites.remove(id);
      printResult(mode, { id, name: found.name, deleted: true }, () => `Deleted S${id}  ${found.name}`);
    });
}
