import type { Command } from "commander";
import { isJiraKey, runId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { CliError, InputError } from "../../core/errors.js";
import { addJiraComment, isJiraUnusable, jiraStatus, moveJiraTicket } from "../../core/jira.js";
import { info, printResult, type OutputMode } from "../../core/output.js";
import { sameName, splitList, uniqueRefs } from "../../core/text.js";
import type { Run, Status, Test } from "../../core/testrail-types.js";
import { MetaService, nameOf } from "../../services/meta.service.js";
import { RunService } from "../../services/run.service.js";
import { TestService } from "../../services/test.service.js";

interface SyncOptions {
  move?: string;
  yes?: boolean;
}

/** Most not-passed tests a comment lists by name; the rest are counted. */
const MAX_LISTED = 25;

/** A Jira key and the tests that relate to it: every test for a run ref, the case's tests for a case ref. */
interface Plan {
  key: string;
  scope: "run" | "cases";
  tests: Test[];
}

interface TestLine {
  id: number;
  title: string;
  status: string;
}

interface TicketView {
  key: string;
  scope: "run" | "cases";
  tests: {
    total: number;
    passed: number;
    untested: number;
    counts: Record<string, number>;
    notPassed: TestLine[];
  };
  commented: boolean;
  moved: string | null;
  /** Why --move left the ticket where it was, e.g. "not every test passed". */
  moveSkipped: string | null;
  error: { code: string; message: string } | null;
}

export function registerSync(run: Command): void {
  run
    .command("sync <run>")
    .description("Comment a run's results on its linked Jira tickets (run and case refs); needs jira-cli")
    .option("-o, --move <status>", "Also move each ticket whose tests all passed to this Jira status")
    .option("-y, --yes", "Post without asking")
    .action(async (rawId: string, opts: SyncOptions, cmd: Command) => {
      const id = runId(rawId);
      const target = opts.move?.trim();
      if (opts.move !== undefined && !target)
        throw new InputError("USAGE", "--move needs a Jira status, e.g. Done");
      const { mode } = bootstrap(cmd);
      const [found, tests, statuses] = await Promise.all([
        new RunService().get(id),
        new TestService().list(id, [], Number.MAX_SAFE_INTEGER),
        new MetaService().statuses(),
      ]);
      const plans = planTickets(found, tests.items);
      if (plans.length === 0) {
        throw new InputError(
          "NO_JIRA_KEYS",
          `Run R${id} and its cases have no Jira keys in refs; link some with testrail link add.`,
        );
      }
      const views = plans.map((plan) => toView(plan, statuses));
      if (!opts.yes) {
        info(views.map((view) => `${view.key}  ${tally(view)} → ${planned(view, target)}`).join("\n"));
        const moves = target ? `, and move the fully passed ones to "${target}"` : "";
        await confirm(`Comment on ${views.length} Jira ticket(s) above${moves}?`);
      }
      for (const [index, view] of views.entries()) {
        const stopped = await syncOrStop(views, view, comment(found, plans[index]!, view), target);
        if (stopped) break;
      }
      report(mode, found, target, views);
    });
}

/**
 * Run refs first (every test), then each case's refs (its tests), keys in order of first appearance.
 * A run ref that a case also links (a run made from a sprint or epic) is judged by its own cases.
 */
function planTickets(run: Run, tests: Test[]): Plan[] {
  const caseKeys = new Set(tests.flatMap((test) => jiraRefs(test.refs)));
  const runKeys = jiraRefs(run.refs).filter((key) => !caseKeys.has(key));
  const plans = runKeys.map((key): Plan => ({ key, scope: "run", tests }));
  const byKey = new Map<string, Plan>();
  const pairs = tests.flatMap((test) => jiraRefs(test.refs).map((key) => [key, test] as const));
  for (const [key, test] of pairs) {
    if (runKeys.includes(key)) continue;
    const plan = byKey.get(key) ?? { key, scope: "cases", tests: [] };
    plan.tests.push(test);
    byKey.set(key, plan);
  }
  return [...plans, ...byKey.values()];
}

/** Refs that look like Jira keys, upper-cased; other refs (URLs, notes) are ignored. */
const jiraRefs = (refs: string | null): string[] =>
  uniqueRefs(splitList(refs).map((ref) => ref.toUpperCase())).filter(isJiraKey);

function toView(plan: Plan, statuses: Status[]): TicketView {
  const counts: Record<string, number> = {};
  const notPassed: TestLine[] = [];
  let passed = 0;
  let untested = 0;
  for (const test of plan.tests) {
    const status = statuses.find((item) => item.id === test.status_id);
    const label = nameOf(statuses, test.status_id) ?? "Untested";
    counts[label] = (counts[label] ?? 0) + 1;
    if (status?.name === "passed") passed += 1;
    else if (status?.is_untested) untested += 1;
    else notPassed.push({ id: test.id, title: test.title, status: label });
  }
  return {
    key: plan.key,
    scope: plan.scope,
    tests: { total: plan.tests.length, passed, untested, counts, notPassed },
    commented: false,
    moved: null,
    moveSkipped: null,
    error: null,
  };
}

/** Only a ticket whose every related test passed moves; untested tests hold it back too. */
const allPassed = (view: TicketView): boolean =>
  view.tests.total > 0 && view.tests.passed === view.tests.total;

const tally = (view: TicketView): string => `${view.tests.passed} of ${view.tests.total} tests passed`;

function planned(view: TicketView, target: string | undefined): string {
  if (!target) return "comment";
  return allPassed(view) ? `comment, move to "${target}"` : "comment (not moved: not every test passed)";
}

function comment(run: Run, plan: Plan, view: TicketView): string {
  const scope = plan.scope === "run" ? "all tests" : `tests of the cases linked to ${plan.key}`;
  const counts = Object.entries(view.tests.counts)
    .map(([label, count]) => `${label} ${count}`)
    .join(", ");
  const lines = [
    `TestRail run R${run.id} "${run.name}" (${scope}): ${tally(view)}${counts ? ` (${counts})` : ""}.`,
  ];
  const failed = view.tests.notPassed;
  if (failed.length > 0) {
    const listed = failed.slice(0, MAX_LISTED).map((test) => `T${test.id} ${test.status}: ${test.title}`);
    if (failed.length > MAX_LISTED) listed.push(`… and ${failed.length - MAX_LISTED} more`);
    lines.push(`Not passed:\n${listed.join("\n")}`);
  }
  lines.push(run.url);
  return lines.join("\n\n");
}

/**
 * sync, but when jira-cli stops working after some tickets were commented on, keeps the error on
 * this view and returns true, so the report names the tickets done and a rerun can skip them.
 */
async function syncOrStop(
  views: readonly TicketView[],
  view: TicketView,
  text: string,
  target: string | undefined,
): Promise<boolean> {
  try {
    await sync(view, text, target);
    return false;
  } catch (err) {
    if (!views.some((item) => item.commented)) throw err;
    const { code, message } = err instanceof CliError ? err : new CliError("UNEXPECTED", String(err));
    view.error = { code, message };
    return true;
  }
}

/** Comments, then moves when asked and every test passed; a failure is kept on the view, not thrown. */
async function sync(view: TicketView, text: string, target: string | undefined): Promise<void> {
  try {
    await addJiraComment(view.key, text);
    view.commented = true;
    if (!target) return;
    if (!allPassed(view)) {
      view.moveSkipped = "not every test passed";
      return;
    }
    const current = await jiraStatus(view.key);
    if (sameName(current, target)) {
      view.moveSkipped = `already ${current}`;
      return;
    }
    view.moved = await moveJiraTicket(view.key, target);
  } catch (err) {
    // jira-cli missing or not set up: every other key would fail the same way.
    if (isJiraUnusable(err) || !(err instanceof CliError)) throw err;
    view.error = { code: err.code, message: err.message };
  }
}

function report(mode: OutputMode, run: Run, target: string | undefined, views: TicketView[]): void {
  const data = { run: { id: run.id, name: run.name, url: run.url }, move: target ?? null, tickets: views };
  const failed = views.filter((view) => view.error !== null);
  if (failed.length > 0) {
    if (mode === "human") printResult(mode, data, () => render(data.run, views));
    throw new CliError(
      "SYNC_FAILED",
      `Jira refused ${failed.length} of ${views.length} ticket(s): ${failed.map((view) => view.key).join(", ")}. The others were synced; rerun only after fixing, or they get a second comment.`,
      data,
    );
  }
  printResult(mode, data, () => render(data.run, views));
}

function render(run: { id: number; name: string; url: string }, views: TicketView[]): string {
  const lines = views.map((view) => {
    const done = [view.commented ? "commented" : "not commented"];
    if (view.moved) done.push(`moved to ${view.moved}`);
    if (view.moveSkipped) done.push(`not moved: ${view.moveSkipped}`);
    const error = view.error ? `  error [${view.error.code}]: ${view.error.message}` : "";
    return `${view.key}  ${tally(view)}; ${done.join(", ")}${error}`;
  });
  return [`Synced R${run.id}  ${run.name}`, lines.join("\n"), run.url].join("\n\n");
}
