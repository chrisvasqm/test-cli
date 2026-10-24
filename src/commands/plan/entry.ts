import type { Command } from "commander";
import { caseIds, jiraKey, suiteId } from "../../core/args.js";
import type { Config } from "../../core/config.js";
import { InputError } from "../../core/errors.js";
import { jiraTicket, type JiraTicket } from "../../core/jira.js";
import { clip, MAX_NAME } from "../../core/text.js";
import type { User } from "../../core/testrail-types.js";
import { ConfigurationService, configCombinations, configIds } from "../../services/configuration.service.js";
import type { PlanEntryInput, PlanRunInput } from "../../services/plan.service.js";
import { ProjectService } from "../../services/project.service.js";
import { UserService } from "../../services/user.service.js";
import { linkedCases } from "../run/create.js";

/** The flags that describe one plan entry (add-run, and the optional first entry of create). */
export interface EntryOptions {
  suite?: string;
  cases?: string;
  fromJira?: string;
  assign?: string;
  configs?: string;
}

/** Adds the entry flags; add-run also gives the entry a name with -N (create's -N names the plan). */
export function entryOptions(cmd: Command): Command {
  return cmd
    .option("-S, --suite <suite>", "Suite of the runs, e.g. S1 (default: the config's, or the only suite)")
    .option("-C, --cases <ids>", "Only these cases, comma-separated (e.g. C1,C2); default: every case")
    .option("-J, --from-jira <key>", "Only the cases linked to this Jira ticket (needs jira-cli)")
    .option("-a, --assign <user>", "Assign the runs: me, an email or a user id")
    .option("-g, --configs <names>", "One run per combination of these configurations, e.g. Chrome,Windows");
}

/** True when any entry flag was given, so create adds a first entry. */
export const hasEntry = (opts: EntryOptions): boolean =>
  [opts.suite, opts.cases, opts.fromJira, opts.assign, opts.configs].some((value) => value !== undefined);

/** Checks the typed flags before any request. */
export function parseEntry(opts: EntryOptions) {
  return {
    suite: opts.suite === undefined ? undefined : suiteId(opts.suite),
    cases: opts.cases === undefined ? undefined : caseIds(opts.cases),
    key: opts.fromJira === undefined ? undefined : jiraKey(opts.fromJira, "--from-jira"),
  };
}

export interface BuiltEntry {
  input: PlanEntryInput;
  ticket: JiraTicket | undefined;
  assignee: User | undefined;
}

/**
 * The entry to send. Jira first, alone (it may prompt for `jira setup`), then the TestRail lookups.
 * Without configurations the entry is one run; with them, one run per combination across groups.
 */
export async function buildEntry(
  opts: EntryOptions,
  parsed: ReturnType<typeof parseEntry>,
  config: Config,
  name: string | undefined,
): Promise<BuiltEntry> {
  const ticket = parsed.key === undefined ? undefined : await jiraTicket(parsed.key);
  const suite = parsed.suite ?? config.suiteId ?? (await onlySuite(config.projectId));
  const [caseList, assignee, groups] = await Promise.all([
    parsed.cases ?? (parsed.key === undefined ? undefined : linkedCases(config.projectId, suite, parsed.key)),
    new UserService().resolveOptional(opts.assign, config.email, "--assign"),
    opts.configs === undefined ? undefined : new ConfigurationService().groups(config.projectId),
  ]);
  const run: PlanRunInput = { include_all: caseList === undefined };
  if (caseList) run.case_ids = caseList;
  if (assignee) run.assignedto_id = assignee.id;
  const input: PlanEntryInput = { suite_id: suite, ...run };
  const entryName = name ?? (ticket ? clip(`${ticket.key}: ${ticket.summary}`, MAX_NAME) : undefined);
  if (entryName !== undefined) input.name = entryName;
  if (groups && opts.configs !== undefined) {
    const ids = configIds(groups, opts.configs);
    input.config_ids = ids;
    input.runs = configCombinations(groups, ids).map((combo) => ({ ...run, config_ids: combo }));
  }
  return { input, ticket, assignee };
}

/** add_plan_entry needs a suite even in single-suite projects, where the config has none. */
async function onlySuite(projectId: number): Promise<number> {
  const suites = await new ProjectService().activeSuites(projectId);
  if (suites.length === 1) return suites[0]!.id;
  throw new InputError("USAGE", "This project has several suites; give one with --suite, e.g. S1");
}
