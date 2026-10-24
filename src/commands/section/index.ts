import type { Command } from "commander";
import { listLimit } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { moreHint, printResult } from "../../core/output.js";
import { CaseService } from "../../services/case.service.js";

interface ListOptions {
  limit: string;
}

export function registerSection(program: Command): void {
  const section = program.command("section").description("List the sections that hold cases");
  section
    .command("list")
    .description("List sections in the project (and suite) from the config, nested by indent")
    .option("-n, --limit <n>", "Most sections to show", "250")
    .action(async (opts: ListOptions, cmd: Command) => {
      const limit = listLimit(opts.limit);
      const { config, mode } = bootstrap(cmd);
      const { items, hasMore } = await new CaseService().sections(config.projectId, config.suiteId, limit);
      const sections = items.map((item) => ({
        id: item.id,
        name: item.name,
        parentId: item.parent_id,
        depth: item.depth,
      }));
      printResult(mode, { sections, hasMore }, () =>
        sections.length === 0
          ? "No sections."
          : sections.map((item) => `${"  ".repeat(item.depth)}${item.id}  ${item.name}`).join("\n") +
            moreHint(sections.length, hasMore),
      );
    });
}
