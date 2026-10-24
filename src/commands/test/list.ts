import type { Command } from "commander";
import { listLimit, runId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, renderList } from "../../core/output.js";
import { MetaService, nameOf } from "../../services/meta.service.js";
import { TestService } from "../../services/test.service.js";
import { UserService } from "../../services/user.service.js";

interface ListOptions {
  status?: string;
  assigned?: string;
  limit: string;
}

export function registerList(test: Command): void {
  test
    .command("list <run>")
    .description("List the tests in a run, e.g. R3")
    .option("-s, --status <names>", "Only these statuses, comma-separated (e.g. failed,retest)")
    .option("-a, --assigned <user>", "Only tests assigned to me, an email or a user id")
    .option("-n, --limit <n>", "Most tests to show", "100")
    .action(async (rawRun: string, opts: ListOptions, cmd: Command) => {
      const run = runId(rawRun);
      const limit = listLimit(opts.limit);
      const { config, mode } = bootstrap(cmd);
      const meta = new MetaService();
      const [statusIds, assignee] = await Promise.all([
        opts.status === undefined ? [] : meta.statusIds(opts.status),
        opts.assigned === undefined
          ? undefined
          : new UserService().resolve(opts.assigned, config.email, "--assigned"),
      ]);
      const [{ items, hasMore }, statuses] = await Promise.all([
        new TestService().list(run, statusIds, limit, assignee?.id),
        meta.statuses(),
      ]);
      const tests = items.map((item) => ({
        id: item.id,
        caseId: item.case_id,
        title: item.title,
        status: nameOf(statuses, item.status_id),
        assignedToId: item.assignedto_id,
      }));
      printResult(mode, { runId: run, tests, hasMore }, () =>
        renderList(
          tests.map((item) => [`T${item.id}`, `C${item.caseId}`, item.status ?? "", item.title]),
          "No tests.",
          hasMore,
        ),
      );
    });
}
