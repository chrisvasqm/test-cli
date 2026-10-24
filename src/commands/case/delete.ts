import type { Command } from "commander";
import { caseId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { CaseService } from "../../services/case.service.js";

interface DeleteOptions {
  yes?: boolean;
}

export function registerDelete(testCase: Command): void {
  testCase
    .command("delete <case>")
    .description("Delete a case and its tests in active runs, e.g. C12; TestRail has no undo")
    .option("-y, --yes", "Delete without asking")
    .action(async (rawId: string, opts: DeleteOptions, cmd: Command) => {
      const id = caseId(rawId);
      const { mode } = bootstrap(cmd);
      const cases = new CaseService();
      const found = await cases.get(id);
      if (!opts.yes) {
        await confirm(
          `Delete C${id} "${found.title}" and its tests and results in active runs? This cannot be undone.`,
        );
      }
      await cases.remove(id);
      printResult(mode, { id, title: found.title, deleted: true }, () => `Deleted C${id}  ${found.title}`);
    });
}
