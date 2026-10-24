import type { Command } from "commander";
import { provider, type Provider } from "../../providers/index.js";
import { caseIds, milestoneId, runId } from "../../providers/testrail/ids.js";
import { jiraKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { readOptionalText } from "../../core/input.js";
import { jiraTickets, type JiraTicket, type JiraTickets, type TicketSource } from "../../core/jira.js";
import { info, printResult, table } from "../../core/output.js";
import { clip, fitRefs, joinRefs, MAX_NAME } from "../../core/text.js";
import type { Run } from "../../providers/testrail/types.js";
import type { RunInput } from "../../providers/types.js";
import { fromJiraKey, jiraView, loadFromJira } from "../from-jira.js";
import { renderCounts, toRunSummary, assigneeView } from "../render.js";

interface CreateOptions {
  name?: string;
  fromJira?: string;
  fromSprint?: string;
  fromEpic?: string;
  cases?: string;
  description?: string;
  file?: string;
  refs?: string;
  milestone?: string;
  assign?: string;
  fromRun?: string;
  status?: string;
}

/** The statuses `--from-run` reruns when `--status` is not given. */
const RERUN_STATUSES = "failed,retest,blocked";

export function registerCreate(run: Command): void {
  run
    .command("create")
    .description("Create a run in the project (and suite) from the config")
    .option(
      "-na, --name <name>",
      "Run name (required unless --from-jira, --from-sprint, --from-epic or --from-run)",
    )
    .option(
      "-fj, --from-jira <key>",
      'Run the cases linked to this Jira ticket; name "KAN-12: <summary>", key in refs (needs jira-cli)',
    )
    .option(
      "-w, --from-sprint <sprint>",
      "Run the cases linked to a sprint's tickets (active, an id or a name); named after the sprint, linked keys in refs (needs jira-cli)",
    )
    .option(
      "-ep, --from-epic <key>",
      'Run the cases linked to an epic\'s child tickets; name "KAN-5: <summary>", linked keys in refs (needs jira-cli)',
    )
    .option(
      "-ru, --from-run <run>",
      'Rerun an earlier run\'s tests by status, same suite; name "<its name> (rerun)", its milestone',
    )
    .option(
      "-s, --status <names>",
      `With --from-run: these statuses, comma-separated (default: ${RERUN_STATUSES})`,
    )
    .option("-ca, --cases <ids>", "Only these cases, comma-separated (e.g. C1,C2); default: every case")
    .option("-d, --description <text>", "Description (Markdown)")
    .option("-f, --file <path>", "Read the description from a file (- reads stdin)")
    .option("-r, --refs <keys>", "References, comma-separated (e.g. KAN-1)")
    .option("-ml, --milestone <id>", "Milestone id, e.g. M3")
    .option("-a, --assign <user>", "Assign the run: me, an email or a user id")
    .action(async (opts: CreateOptions, cmd: Command) => {
      const cases = opts.cases === undefined ? undefined : caseIds(opts.cases);
      const milestone = opts.milestone === undefined ? undefined : milestoneId(opts.milestone);
      const tickets = ticketSource(opts);
      const sourceId = fromRunId(opts);
      const key =
        sourceId === undefined && tickets === undefined
          ? fromJiraKey(opts.fromJira, opts.name, "--name")
          : undefined;
      const description = await readOptionalText(opts.description, opts.file, "description");
      const { config, mode } = bootstrap(cmd);
      // Jira first, alone: it may prompt for `jira setup`. Then the TestRail lookups, all before the
      // write; statuses too, as a failed lookup after it would report an error for a run that exists.
      const { ticket, refs: given } = await loadFromJira(key, opts.refs);
      const found = tickets === undefined ? undefined : await jiraTickets(tickets);
      const { meta } = provider();
      const [rerun, fromTickets, linked, statuses, assignee] = await Promise.all([
        sourceId === undefined ? undefined : rerunCases(sourceId, opts.status, meta),
        found === undefined ? undefined : ticketCases(config.projectId, config.suiteId, found),
        key === undefined || cases
          ? undefined
          : linkedCases(config.projectId, config.suiteId, key, "run create"),
        meta.statuses(),
        provider().users.resolveOptional(opts.assign, config.email, "--assign"),
      ]);
      const caseList = rerun?.caseIds ?? fromTickets?.caseIds ?? cases ?? linked;
      // Typed refs first; a sprint's keys can outgrow the refs field, so the rest are named instead.
      const { refs, left } = fitRefs(given, fromTickets?.linked ?? []);
      if (left.length > 0) info(`The run's refs have no room for ${left.join(", ")}.`);
      const source = rerun?.source;
      const name = opts.name ?? clip(defaultName(source, found, ticket), MAX_NAME);
      const input: RunInput = { name, include_all: caseList === undefined };
      const suite = source?.suite_id ?? config.suiteId;
      if (suite !== undefined) input.suite_id = suite;
      if (caseList) input.case_ids = caseList;
      if (description !== undefined) input.description = description;
      const milestoneToSet = milestone ?? source?.milestone_id ?? undefined;
      if (milestoneToSet !== undefined) input.milestone_id = milestoneToSet;
      if (refs.length > 0) input.refs = joinRefs(refs);
      if (assignee) input.assignedto_id = assignee.id;
      const created = await provider().runs.add(config.projectId, input);
      const view = {
        ...toRunSummary(created, statuses),
        includeAll: created.include_all,
        assignedTo: assigneeView(assignee),
        jira: jiraView(ticket),
        tickets:
          found && fromTickets
            ? {
                from: found.kind,
                name: found.name,
                linked: fromTickets.linked,
                unlinked: fromTickets.unlinked,
              }
            : null,
        fromRun: source ? { id: source.id, name: source.name, planId: source.plan_id } : null,
      };
      printResult(mode, view, () =>
        [
          `Created R${view.id}  ${view.name}`,
          table([
            ["Tests", renderCounts(view.counts)],
            ...(view.fromRun ? [["From", fromRunLabel(view.fromRun)] as const] : []),
            ...(view.tickets ? [["Tickets", ticketsLabel(view.tickets)] as const] : []),
            ...(view.assignedTo ? [["Assigned", view.assignedTo.name] as const] : []),
            ["URL", view.url],
          ]),
        ].join("\n\n"),
      );
    });
}

/**
 * Ids of the cases linked to the key; a run of none would be empty. `command` is the caller as
 * typed (e.g. "plan add-run"), named in the error with its --cases flag.
 */
export async function linkedCases(
  projectId: number,
  suiteId: number | undefined,
  key: string,
  command: string,
): Promise<number[]> {
  const ids = await provider().cases.linkedTo(projectId, suiteId, key);
  if (ids.length === 0) {
    throw new InputError(
      "NO_LINKED_CASES",
      `No case in this project${suiteId === undefined ? "" : " and suite"} has ${key} in its refs. Link some with \`test-cli link add C12 ${key}\`, or give \`test-cli ${command}\` the cases with --cases.`,
    );
  }
  return ids;
}

/** --from-sprint or --from-epic; each builds its own case list, so it stands alone. */
function ticketSource(opts: CreateOptions): TicketSource | undefined {
  const flag =
    opts.fromSprint !== undefined ? "--from-sprint" : opts.fromEpic !== undefined ? "--from-epic" : undefined;
  if (flag === undefined) return undefined;
  const others = [opts.fromSprint, opts.fromEpic, opts.fromJira, opts.fromRun, opts.cases];
  if (others.filter((value) => value !== undefined).length > 1) {
    throw new InputError(
      "USAGE",
      "Use one of --from-sprint and --from-epic, without --from-jira, --from-run or --cases",
    );
  }
  if (opts.fromEpic !== undefined) return { epic: jiraKey(opts.fromEpic, "--from-epic") };
  const sprint = opts.fromSprint?.trim() ?? "";
  if (sprint === "") throw new InputError("USAGE", `${flag} needs active, a sprint id or a name`);
  return { sprint };
}

/** The cases linked to the tickets, and which tickets have some; none at all would make an empty run. */
async function ticketCases(projectId: number, suiteId: number | undefined, found: JiraTickets) {
  const keys = found.tickets.map((item) => item.key);
  const byKey = await provider().cases.linkedToEach(projectId, suiteId, keys);
  if (byKey.size === 0) {
    const what =
      keys.length === 0
        ? "has no tickets in jira-cli's project"
        : `has no ticket linked to a case in this project${suiteId === undefined ? "" : " and suite"}`;
    throw new InputError(
      "NO_LINKED_CASES",
      `${found.kind === "sprint" ? "Sprint" : "Epic"} ${found.name} ${what}. Link cases with \`test-cli link add C12 KAN-12\`.`,
    );
  }
  const ids = [...new Set([...byKey.values()].flat().map((item) => item.id))];
  return {
    caseIds: ids,
    linked: keys.filter((key) => byKey.has(key)),
    unlinked: keys.filter((key) => !byKey.has(key)),
  };
}

function defaultName(
  source: Run | undefined,
  found: JiraTickets | undefined,
  ticket: JiraTicket | undefined,
): string {
  if (source) return `${source.name} (rerun)`;
  return found?.name ?? `${ticket?.key}: ${ticket?.summary}`;
}

const ticketsLabel = (tickets: { linked: string[]; unlinked: string[] }): string =>
  tickets.linked.join(", ") +
  (tickets.unlinked.length === 0 ? "" : `; no cases: ${tickets.unlinked.join(", ")}`);

/** --from-run as an id; it builds its own case list, so --cases and --from-jira cannot join it. */
function fromRunId(opts: CreateOptions): number | undefined {
  if (opts.fromRun === undefined) {
    if (opts.status !== undefined) throw new InputError("USAGE", "--status needs --from-run");
    return undefined;
  }
  if (opts.cases !== undefined || opts.fromJira !== undefined) {
    throw new InputError("USAGE", "Use --from-run alone, without --cases or --from-jira");
  }
  return runId(opts.fromRun);
}

/** The source run and the cases of its tests in those statuses; none would make an empty run. */
async function rerunCases(
  id: number,
  status: string | undefined,
  meta: Provider["meta"],
): Promise<{ source: Run; caseIds: number[] }> {
  const typed = status ?? RERUN_STATUSES;
  const [source, statusIds] = await Promise.all([provider().runs.get(id), meta.statusIds(typed)]);
  if (statusIds.length === 0) throw new InputError("USAGE", "Give at least one status name");
  const ids = [...new Set((await provider().tests.all(id, statusIds)).map((item) => item.case_id))];
  if (ids.length === 0) {
    throw new InputError("NO_MATCHING_TESTS", `Run R${id} has no tests with status ${typed}.`);
  }
  return { source, caseIds: ids };
}

const fromRunLabel = (from: { id: number; name: string; planId: number | null }): string =>
  `R${from.id}  ${from.name}${from.planId === null ? "" : ` (in plan R${from.planId})`}`;
