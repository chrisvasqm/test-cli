import type { Command } from "commander";
import { intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { SectionService } from "../../services/section.service.js";

interface DeleteOptions {
  yes?: boolean;
}

export function registerDelete(section: Command): void {
  section
    .command("delete <section>")
    .description("Delete a section, its child sections and all their cases; TestRail has no undo")
    .option("-y, --yes", "Delete without asking")
    .action(async (rawId: string, opts: DeleteOptions, cmd: Command) => {
      const id = intInRange(rawId, "<section>", 1);
      const { mode } = bootstrap(cmd);
      const sections = new SectionService();
      const found = await sections.get(id);
      if (!opts.yes) {
        await confirm(
          `Delete section ${id} "${found.name}" with its child sections and all their cases? This cannot be undone.`,
        );
      }
      await sections.remove(id);
      printResult(
        mode,
        { id, name: found.name, deleted: true },
        () => `Deleted section ${id}  ${found.name}`,
      );
    });
}
