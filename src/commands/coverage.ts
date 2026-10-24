import type { Command } from "commander";
import { intInRange, jiraKey } from "../core/args.js";
import { bootstrap } from "../core/bootstrap.js";
import { InputError } from "../core/errors.js";
import { jiraTickets, type TicketSource } from "../core/jira.js";
import { grid, printResult } from "../core/output.js";
import type { Case, Run, Status, Test } from "../core/testrail-types.js";
import { CaseService } from "../services/case.service.js";
import { MetaService, nameOf } from "../services/meta.service.js";
import { RunService } from "../services/run.service.js";
import { TestService } from "../services/test.service.js";

/** Most runs to read: one TestRail page. */
const MAX_RUNS = 250;
/** Runs read at once, newest first; reading stops once every case has a result. */
const RUN_BATCH = 5;

interface CoverageOptions {
  sprint?: string;
  epic?: string;
  jql?: string;
  runs: string;
}

/** A case's latest result: its test's status in the newest scanned run where it is not Untested. */
interface Latest {
  statusId: number;
  status: string;
  runId: number;
  testId: number;
}

export function registerCoverage(program: Command): void {
  program
    .command("coverage")
    .description(
      "Show which Jira tickets have linked cases, and each case's latest result (needs jira-cli; read-only)",
    )
    .option(
      "-w, --sprint <sprint>",
      "A sprint's tickets: active, an id or a name (default: the active sprint)",
    )
    .option("-K, --epic <key>", "An epic's child tickets, e.g. KAN-5")
    .option("-Q, --jql <query>", "The tickets this JQL finds")
    .option(
      "-W, --runs <n>",
      `How many of the latest runs to read results from, open and closed (at most ${MAX_RUNS})`,
      "25",
    )
    .action(async (opts: CoverageOptions, cmd: Command) => {
      const source = ticketSource(opts);
      const scan = intInRange(opts.runs, "--runs", 1, MAX_RUNS);
      const { config, mode } = bootstrap(cmd);
      // Jira first, alone: it may prompt for `jira setup`.
      const found = await jiraTickets(source);
      const keys = found.tickets.map((item) => item.key);
      const [byKey, runs, statuses] = await Promise.all([
        new CaseService().linkedToEach(config.projectId, config.suiteId, keys),
        new RunService().recent(config.projectId, config.suiteId, scan),
        new MetaService().statuses(),
      ]);
      const caseIds = new Set([...byKey.values()].flat().map((item) => item.id));
      const latest = await latestResults(runs.items, caseIds, statuses);
      const tickets = found.tickets.map((ticket) => ({
        key: ticket.key,
        summary: ticket.summary,
        status: ticket.status,
        cases: (byKey.get(ticket.key) ?? []).map((item: Case) => ({
          id: item.id,
          title: item.title,
          latest: latestView(latest.get(item.id)),
        })),
      }));
      const view = {
        source: { from: found.kind, name: found.name, jql: found.jql },
        tickets,
        summary: summarize(tickets, latest, caseIds, statuses),
        runsScanned: runs.items.length,
        moreRuns: runs.hasMore,
      };
      printResult(mode, view, () => renderCoverage(view));
    });
}

const latestView = (latest: Latest | undefined) =>
  latest ? { status: latest.status, runId: latest.runId, testId: latest.testId } : null;

/** Exactly one of --sprint, --epic and --jql; none means the active sprint. */
function ticketSource(opts: CoverageOptions): TicketSource {
  const given = [opts.sprint, opts.epic, opts.jql].filter((value) => value !== undefined);
  if (given.length > 1) throw new InputError("USAGE", "Use one of --sprint, --epic and --jql");
  if (opts.epic !== undefined) return { epic: jiraKey(opts.epic, "--epic") };
  if (opts.jql !== undefined) {
    if (opts.jql.trim() === "") throw new InputError("USAGE", "--jql needs a query");
    return { jql: opts.jql.trim() };
  }
  const sprint = (opts.sprint ?? "active").trim();
  if (sprint === "") throw new InputError("USAGE", "--sprint needs active, a sprint id or a name");
  return { sprint };
}

/**
 * Each case's latest result across the runs, newest run first (by creation). A test's status is its
 * latest result in that run, so one get_tests per run is enough; runs are read RUN_BATCH at a time
 * and reading stops once every case has a result. Runs inside test plans are not scanned.
 */
async function latestResults(
  runs: readonly Run[],
  caseIds: ReadonlySet<number>,
  statuses: readonly Status[],
): Promise<Map<number, Latest>> {
  const latest = new Map<number, Latest>();
  if (caseIds.size === 0) return latest;
  const untested = new Set(statuses.filter((status) => status.is_untested).map((status) => status.id));
  const ordered = runs.toSorted((left, right) => right.created_on - left.created_on || right.id - left.id);
  const tests = new TestService();
  for (let start = 0; start < ordered.length && latest.size < caseIds.size; start += RUN_BATCH) {
    const batch = ordered.slice(start, start + RUN_BATCH);
    const found = await Promise.all(batch.map((run) => tests.all(run.id)));
    // In run order, so a newer run's result wins.
    for (const runTests of found) keepLatest(runTests, caseIds, untested, statuses, latest);
  }
  return latest;
}

function keepLatest(
  runTests: readonly Test[],
  caseIds: ReadonlySet<number>,
  untested: ReadonlySet<number>,
  statuses: readonly Status[],
  latest: Map<number, Latest>,
): void {
  for (const test of runTests) {
    if (!caseIds.has(test.case_id) || latest.has(test.case_id) || untested.has(test.status_id)) continue;
    const label = nameOf(statuses, test.status_id) ?? `#${test.status_id}`;
    latest.set(test.case_id, {
      statusId: test.status_id,
      status: label,
      runId: test.run_id,
      testId: test.id,
    });
  }
}

/** Tickets with and without cases; each case counted once, by its latest status. */
function summarize(
  tickets: readonly { cases: readonly unknown[] }[],
  latest: ReadonlyMap<number, Latest>,
  caseIds: ReadonlySet<number>,
  statuses: readonly Status[],
) {
  const covered = tickets.filter((ticket) => ticket.cases.length > 0).length;
  const counts = { passed: 0, failed: 0, untested: 0, other: 0 };
  for (const id of caseIds) {
    const result = latest.get(id);
    const name = result && statuses.find((status) => status.id === result.statusId)?.name;
    if (!result) counts.untested += 1;
    else if (name === "passed" || name === "failed") counts[name] += 1;
    else counts.other += 1;
  }
  return {
    tickets: tickets.length,
    covered,
    uncovered: tickets.length - covered,
    cases: caseIds.size,
    ...counts,
  };
}

type CoverageView = {
  source: { name: string };
  tickets: {
    key: string;
    summary: string;
    status: string;
    cases: { id: number; latest: ReturnType<typeof latestView> }[];
  }[];
  summary: ReturnType<typeof summarize>;
  runsScanned: number;
  moreRuns: boolean;
};

function renderCoverage(view: CoverageView): string {
  const { summary } = view;
  const head = [
    `${view.source.name}: ${plural(summary.tickets, "ticket")}, ${summary.covered} covered, ${summary.uncovered} uncovered`,
    `Cases: ${summary.cases} (passed ${summary.passed}, failed ${summary.failed}, untested ${summary.untested}, other ${summary.other}) by their latest result in ${plural(view.runsScanned, "recent run")}`,
  ].join("\n");
  if (view.tickets.length === 0) return `${head}\n\nNo tickets.`;
  const rows = view.tickets.map((ticket) => [
    ticket.key,
    ticket.status,
    ticket.cases.length === 0
      ? "UNCOVERED"
      : ticket.cases.map((item) => `C${item.id} ${item.latest?.status ?? "Untested"}`).join(", "),
    ticket.summary,
  ]);
  return `${head}\n\n${grid([["KEY", "STATUS", "CASES", "SUMMARY"], ...rows])}`;
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;
