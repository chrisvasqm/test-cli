import type { Command } from "commander";
import { isJiraKey, runId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { jiraStatuses } from "../../core/jira.js";
import { grid, printResult } from "../../core/output.js";
import type { Result, Test } from "../../core/testrail-types.js";
import { sameName, splitList, uniqueRefs } from "../../core/text.js";
import { MetaService } from "../../services/meta.service.js";
import { ResultService } from "../../services/result.service.js";
import { RunService } from "../../services/run.service.js";
import { TestService } from "../../services/test.service.js";

/** The statuses checked when `--status` is not given. */
const RETEST_FROM = "failed,blocked";
/** Jira statuses that count as fixed when `--done` is not given. */
const DONE = "Done";

interface RetestOptions {
  status: string;
  done: string;
  yes?: boolean;
}

interface TestRow {
  testId: number;
  caseId: number;
  title: string;
}
type RetestRow = TestRow & { bugs: string[] };
type WaitingRow = TestRow & { bugs: { key: string; status: string }[] };
type ErrorRow = TestRow & { code: string; message: string; keys: string[] };

interface Plan {
  retested: RetestRow[];
  waiting: WaitingRow[];
  unlinked: TestRow[];
  errors: ErrorRow[];
}

export function registerRetest(run: Command): void {
  run
    .command("retest <run>")
    .description("Set tests back to Retest when every Jira bug in their defects is done (needs jira-cli)")
    .option("-s, --status <names>", "Check tests with these statuses, comma-separated", RETEST_FROM)
    .option("-o, --done <names>", "Jira statuses that mean fixed, comma-separated", DONE)
    .option("-y, --yes", "Add the Retest results without asking")
    .action(async (rawRun: string, opts: RetestOptions, cmd: Command) => {
      const id = runId(rawRun);
      const doneNames = splitList(opts.done);
      const { mode } = bootstrap(cmd);
      const meta = new MetaService();
      // TestRail first, so an unknown or closed run fails before any Jira call.
      const [, statusIds, retest] = await Promise.all([
        new RunService().open(id),
        meta.statusIds(opts.status),
        meta.status("retest"),
      ]);
      const [{ items: tests }, { items: results }] = await Promise.all([
        new TestService().list(id, statusIds, Number.MAX_SAFE_INTEGER),
        new ResultService().forRun(id),
      ]);
      const bugsOf = new Map(tests.map((test) => [test.id, streakDefects(test, results, statusIds)]));
      const keys = uniqueRefs([...bugsOf.values()].flat());
      const statuses = keys.length > 0 ? await jiraStatuses(keys) : new Map<string, string | null>();
      const statusOf = (key: string) => statuses.get(key) ?? null;
      const isDone = (key: string) => doneNames.some((name) => sameName(name, statusOf(key) ?? ""));

      const plan: Plan = { retested: [], waiting: [], unlinked: [], errors: [] };
      for (const test of tests) {
        const row = { testId: test.id, caseId: test.case_id, title: test.title };
        const bugs = bugsOf.get(test.id) ?? [];
        const missing = bugs.filter((key) => statusOf(key) === null);
        if (bugs.length === 0) plan.unlinked.push(row);
        else if (missing.length > 0) plan.errors.push({ ...row, ...notFound(missing) });
        else if (bugs.every(isDone)) plan.retested.push({ ...row, bugs });
        else plan.waiting.push({ ...row, bugs: bugs.map((key) => ({ key, status: statusOf(key) ?? "" })) });
      }

      if (plan.retested.length > 0 && !opts.yes) {
        await confirm(
          `${renderRows(plan.retested, statusOf)}\nSet ${count(plan.retested.length)} to Retest in R${id}?`,
        );
      }
      const added =
        plan.retested.length === 0
          ? []
          : await new ResultService().addForCases(
              id,
              plan.retested.map((row) => ({
                case_id: row.caseId,
                status_id: retest.id,
                comment: `Retest: ${row.bugs.map((key) => `${key} is ${statusOf(key)}`).join(", ")}`,
                defects: row.bugs.join(","),
              })),
            );
      const retested = plan.retested.map((row, index) => ({ ...row, resultId: added[index]?.id ?? null }));
      const view = { runId: id, ...plan, retested };
      printResult(mode, view, () => renderReport(view, statusOf));
    });
}

/**
 * Jira keys in the defects of the test's current streak: its results newest first, while the status
 * is one of `statusIds` or none (a comment). An older pass or retest ends it, so a bug that was
 * already retested does not send the test back after it fails again.
 */
function streakDefects(test: Test, results: readonly Result[], statusIds: readonly number[]): string[] {
  const own = results
    .filter((result) => result.test_id === test.id)
    .toSorted((left, right) => right.created_on - left.created_on || right.id - left.id);
  const defects: string[] = [];
  for (const result of own) {
    if (result.status_id !== null && !statusIds.includes(result.status_id)) break;
    defects.push(...splitList(result.defects).map((part) => part.toUpperCase()));
  }
  return uniqueRefs(defects.filter(isJiraKey));
}

function notFound(keys: string[]) {
  return {
    code: "JIRA_TICKET_NOT_FOUND",
    message: `Jira has no ticket ${keys.join(", ")}, or you cannot see it.`,
    keys,
  };
}

function renderRows(rows: readonly RetestRow[], statusOf: (key: string) => string | null) {
  return grid(
    rows.map((row) => [
      `T${row.testId}`,
      `C${row.caseId}`,
      row.bugs.map((key) => `${key} ${statusOf(key)}`).join(", "),
      row.title,
    ]),
  );
}

function renderReport(view: Plan & { runId: number }, statusOf: (key: string) => string | null): string {
  const parts = [
    view.retested.length > 0
      ? `Set ${count(view.retested.length)} to Retest in R${view.runId}\n${renderRows(view.retested, statusOf)}`
      : `No tests in R${view.runId} to set to Retest`,
  ];
  if (view.waiting.length > 0) {
    const rows = view.waiting.map((row) => [
      `T${row.testId}`,
      `C${row.caseId}`,
      row.bugs.map((bug) => `${bug.key} ${bug.status}`).join(", "),
      row.title,
    ]);
    parts.push(`Waiting on Jira:\n${grid(rows)}`);
  }
  if (view.unlinked.length > 0) {
    const rows = view.unlinked.map((row) => [`T${row.testId}`, `C${row.caseId}`, row.title]);
    parts.push(`No Jira bug in their defects:\n${grid(rows)}`);
  }
  if (view.errors.length > 0) {
    const rows = view.errors.map((row) => [`T${row.testId}`, `C${row.caseId}`, row.message]);
    parts.push(`Not retested:\n${grid(rows)}`);
  }
  return parts.join("\n\n");
}

const count = (tests: number): string => (tests === 1 ? "1 test" : `${tests} tests`);
