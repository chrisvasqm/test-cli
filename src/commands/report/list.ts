import type { Command } from "commander";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, renderList } from "../../core/output.js";
import { ReportService } from "../../services/report.service.js";

const EMPTY = 'No reports. Create a report template in the TestRail UI with "On-demand via the API" on.';

export function registerList(report: Command): void {
  report
    .command("list")
    .description('List the project\'s report templates with "On-demand via the API" on')
    .action(async (_opts: unknown, cmd: Command) => {
      const { config, mode } = bootstrap(cmd);
      const { items, hasMore } = await new ReportService().list(config.projectId);
      const reports = items.map((item) => ({ id: item.id, name: item.name, description: item.description }));
      printResult(mode, { reports, hasMore }, () =>
        renderList(
          reports.map((item) => [String(item.id), item.name]),
          EMPTY,
          hasMore,
        ),
      );
    });
}
