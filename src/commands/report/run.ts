import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, table } from "../../core/output.js";

export function registerRun(report: Command): void {
  report
    .command("run <report>")
    .description("Run a report template (id from report list) and print its links")
    .action(async (rawId: string, _opts: unknown, cmd: Command) => {
      const id = intInRange(rawId, "<report>", 1);
      const { mode } = bootstrap(cmd);
      const found = await provider().reports.run(id);
      const view = { id, url: found.report_url, html: found.report_html, pdf: found.report_pdf };
      printResult(mode, view, () =>
        table([
          ["URL", view.url],
          ["HTML", view.html],
          ["PDF", view.pdf],
        ]),
      );
    });
}
