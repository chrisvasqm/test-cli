import type { Command } from "commander";
import { caseId, intInRange, runId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { inBatches } from "../../core/paging.js";
import type { Run } from "../../core/testrail-types.js";
import { CaseService } from "../../services/case.service.js";
import { MetaService } from "../../services/meta.service.js";
import { ResultService } from "../../services/result.service.js";
import { RunService } from "../../services/run.service.js";
import { UserService } from "../../services/user.service.js";
import { renderResult, toResult } from "../render.js";

/** Most results, and most runs to scan: one TestRail page each. */
const MAX_HISTORY = 250;

interface HistoryOptions {
  run?: string;
  runs?: string;
  limit: string;
}

export function registerHistory(testCase: Command): void {
  testCase
    .command("history <case>")
    .description("Show a case's results across the latest runs, newest first, e.g. C12")
    .option("-R, --run <run>", "Only this run, e.g. R3")
    .option("-W, --runs <n>", `How many of the latest runs to scan, open and closed (at most ${MAX_HISTORY})`)
    .option("-n, --limit <n>", `Most results to show (at most ${MAX_HISTORY})`, "20")
    .action(async (rawId: string, opts: HistoryOptions, cmd: Command) => {
      const id = caseId(rawId);
      const limit = intInRange(opts.limit, "--limit", 1, MAX_HISTORY);
      const onlyRun = opts.run === undefined ? undefined : runId(opts.run);
      if (onlyRun !== undefined && opts.runs !== undefined) {
        throw new InputError("USAGE", "--runs scans the latest runs; leave it out with --run");
      }
      const scan = intInRange(opts.runs ?? "25", "--runs", 1, MAX_HISTORY);
      const { config, mode } = bootstrap(cmd);
      const statusesLoaded = new MetaService().statuses();
      const runService = new RunService();
      // The case is checked even with --run, so an unknown case is CASE_NOT_FOUND, not an empty history.
      const [found, single] = await Promise.all([
        new CaseService().get(id),
        onlyRun === undefined ? undefined : runService.get(onlyRun),
      ]);
      const history = single
        ? await singleRun(single, id, limit)
        : await recentRuns(runService, config.projectId, found.suite_id, scan, id, limit);
      const [statuses, authors] = await Promise.all([
        statusesLoaded,
        authorNames(history.items.map((item) => item.result.created_by)),
      ]);
      const view = {
        case: { id: found.id, title: found.title },
        runsScanned: history.scanned,
        moreRuns: history.moreRuns,
        results: history.items.map(({ run, result }) => ({
          run: { id: run.id, name: run.name },
          testId: result.test_id,
          author: { id: result.created_by, name: authors.get(result.created_by) ?? null },
          ...toResult(result, statuses),
        })),
        hasMore: history.hasMore,
      };
      printResult(mode, view, () => {
        const head = `C${view.case.id}  ${view.case.title}`;
        if (view.results.length === 0) {
          return `${head}\n\nNo results in the ${view.runsScanned} run(s) scanned.`;
        }
        const entries = view.results.map((item) => {
          const where = [
            `R${item.run.id} ${item.run.name}`,
            `T${item.testId}`,
            item.author.name ?? `user ${item.author.id}`,
          ];
          if (item.version) where.push(`build ${item.version}`);
          return `${where.join(" · ")}\n${renderResult(item)}`;
        });
        const more = view.hasMore || view.moreRuns ? "\n\nMore may exist (raise --limit or --runs)." : "";
        return [head, ...entries].join("\n\n") + more;
      });
    });
}

/** With --run, a case outside it is CASE_NOT_IN_RUN. */
async function singleRun(run: Run, id: number, limit: number) {
  const page = await new ResultService().forCase(run.id, id, limit);
  const items = page.items.map((result) => ({ run, result }));
  return { items, hasMore: page.hasMore, scanned: 1, moreRuns: false };
}

/** The scan skips runs without the case; the case's suite only, since other suites cannot hold it. */
async function recentRuns(
  runService: RunService,
  projectId: number,
  suiteId: number,
  scan: number,
  id: number,
  limit: number,
) {
  const runs = await runService.recent(projectId, suiteId, scan);
  const history = await new ResultService().history(runs.items, id, limit);
  return { ...history, moreRuns: runs.hasMore };
}

/** Names of the users who added the results; one get_user each, and an unknown user stays unnamed. */
async function authorNames(ids: number[]): Promise<Map<number, string>> {
  const users = new UserService();
  const unique = [...new Set(ids)];
  const named = await inBatches(unique, (id) => users.byId(id).catch(() => undefined));
  return new Map(named.flatMap((user) => (user ? [[user.id, user.name] as const] : [])));
}
