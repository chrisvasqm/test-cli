import type { Command } from "commander";
import { intInRange, listLimit } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, renderList } from "../../core/output.js";
import { splitList } from "../../core/text.js";
import { CaseService } from "../../services/case.service.js";
import { MetaService, nameOf } from "../../services/meta.service.js";
import { isoTime } from "../render.js";

interface ListOptions {
  section?: string;
  limit: string;
}

export function registerList(testCase: Command): void {
  testCase
    .command("list")
    .description("List the cases in the project (and suite) from the config")
    .option("--section <id>", "Only cases in this section")
    .option("--limit <n>", "Most cases to show", "50")
    .action(async (opts: ListOptions, cmd: Command) => {
      const limit = listLimit(opts.limit);
      const sectionId = opts.section === undefined ? undefined : intInRange(opts.section, "--section", 1);
      const { config, mode } = bootstrap(cmd);
      const meta = new MetaService();
      const [{ items, hasMore }, priorities, types] = await Promise.all([
        new CaseService().list({ projectId: config.projectId, suiteId: config.suiteId, sectionId, limit }),
        meta.priorities(),
        meta.caseTypes(),
      ]);
      const cases = items.map((item) => ({
        id: item.id,
        title: item.title,
        sectionId: item.section_id,
        priority: nameOf(priorities, item.priority_id),
        type: nameOf(types, item.type_id),
        refs: splitList(item.refs),
        updated: isoTime(item.updated_on),
      }));
      printResult(mode, { cases, hasMore }, () =>
        renderList(
          cases.map((item) => [
            `C${item.id}`,
            item.priority ?? "",
            item.type ?? "",
            item.title,
            item.refs.join(", "),
          ]),
          "No cases.",
          hasMore,
        ),
      );
    });
}
