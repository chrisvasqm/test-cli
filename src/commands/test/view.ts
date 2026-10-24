import type { Command } from "commander";
import { intInRange, testId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, table } from "../../core/output.js";
import { splitList } from "../../core/text.js";
import { MetaService, nameOf } from "../../services/meta.service.js";
import { TestService } from "../../services/test.service.js";
import { renderContent, renderResult, testUrl, toContent, toResult } from "../render.js";

/** Most results `test view` shows. */
const MAX_RESULTS = 100;

interface ViewOptions {
  results: string;
}

export function registerView(test: Command): void {
  test
    .command("view <test>")
    .description("Show a test's status, steps and latest results, e.g. T45")
    .option(
      "--results <n>",
      `How many of the latest results to show (0 for none, at most ${MAX_RESULTS})`,
      "5",
    )
    .action(async (rawId: string, opts: ViewOptions, cmd: Command) => {
      const id = testId(rawId);
      const limit = intInRange(opts.results, "--results", 0, MAX_RESULTS);
      const { config, mode } = bootstrap(cmd);
      const tests = new TestService();
      const meta = new MetaService();
      const [found, results, statuses] = await Promise.all([
        tests.get(id),
        limit > 0 ? tests.results(id, limit) : Promise.resolve({ items: [], hasMore: false }),
        meta.statuses(),
      ]);
      const view = {
        id: found.id,
        title: found.title,
        url: testUrl(config, found.id),
        caseId: found.case_id,
        runId: found.run_id,
        status: nameOf(statuses, found.status_id),
        refs: splitList(found.refs),
        ...toContent(found),
        results: { shown: results.items.map((item) => toResult(item, statuses)), hasMore: results.hasMore },
      };
      printResult(mode, view, () => {
        const rows: [string, string][] = [
          ["Status", view.status ?? "none"],
          ["Case", `C${view.caseId}`],
          ["Run", `R${view.runId}`],
        ];
        if (view.refs.length > 0) rows.push(["Refs", view.refs.join(", ")]);
        rows.push(["URL", view.url]);
        const sections = [`T${view.id}  ${view.title}`, table(rows), ...renderContent(view)];
        if (view.results.shown.length > 0) {
          sections.push(["Results (latest first)", ...view.results.shown.map(renderResult)].join("\n\n"));
        }
        return sections.join("\n\n");
      });
    });
}
