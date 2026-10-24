import type { Command } from "commander";
import { caseIds, milestoneId, runId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { readOptionalText } from "../../core/input.js";
import { printResult, table } from "../../core/output.js";
import { clip, joinRefs, MAX_NAME } from "../../core/text.js";
import { CaseService } from "../../services/case.service.js";
import { MetaService } from "../../services/meta.service.js";
import type { Run } from "../../core/testrail-types.js";
import { RunService, type RunInput } from "../../services/run.service.js";
import { TestService } from "../../services/test.service.js";
import { UserService } from "../../services/user.service.js";
import { fromJiraKey, jiraView, loadFromJira } from "../from-jira.js";
import { renderCounts, toRunSummary, assigneeView } from "../render.js";

interface CreateOptions {
  name?: string;
  fromJira?: string;
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
    .option("-N, --name <name>", "Run name (required unless --from-jira or --from-run)")
    .option(
      "-J, --from-jira <key>",
      'Run the cases linked to this Jira ticket; name "KAN-12: <summary>", key in refs (needs jira-cli)',
    )
    .option(
      "-R, --from-run <run>",
      'Rerun an earlier run\'s tests by status, same suite; name "<its name> (rerun)", its milestone',
    )
    .option(
      "-s, --status <names>",
      `With --from-run: these statuses, comma-separated (default: ${RERUN_STATUSES})`,
    )
    .option("-C, --cases <ids>", "Only these cases, comma-separated (e.g. C1,C2); default: every case")
    .option("-d, --description <text>", "Description (Markdown)")
    .option("-f, --file <path>", "Read the description from a file (- reads stdin)")
    .option("-r, --refs <keys>", "References, comma-separated (e.g. KAN-1)")
    .option("-M, --milestone <id>", "Milestone id, e.g. M3")
    .option("-a, --assign <user>", "Assign the run: me, an email or a user id")
    .action(async (opts: CreateOptions, cmd: Command) => {
      const cases = opts.cases === undefined ? undefined : caseIds(opts.cases);
      const milestone = opts.milestone === undefined ? undefined : milestoneId(opts.milestone);
      const sourceId = fromRunId(opts);
      const key = sourceId === undefined ? fromJiraKey(opts.fromJira, opts.name, "--name") : undefined;
      const description = await readOptionalText(opts.description, opts.file, "description");
      const { config, mode } = bootstrap(cmd);
      // Jira first, alone: it may prompt for `jira setup`. Then the TestRail lookups, all before the
      // write; statuses too, as a failed lookup after it would report an error for a run that exists.
      const { ticket, refs } = await loadFromJira(key, opts.refs);
      const meta = new MetaService();
      const [rerun, linked, statuses, assignee] = await Promise.all([
        sourceId === undefined ? undefined : rerunCases(sourceId, opts.status, meta),
        key === undefined || cases ? undefined : linkedCases(config.projectId, config.suiteId, key),
        meta.statuses(),
        new UserService().resolveOptional(opts.assign, config.email, "--assign"),
      ]);
      const caseList = rerun?.caseIds ?? cases ?? linked;
      const source = rerun?.source;
      const name =
        opts.name ?? clip(source ? `${source.name} (rerun)` : `${ticket?.key}: ${ticket?.summary}`, MAX_NAME);
      const input: RunInput = { name, include_all: caseList === undefined };
      const suite = source?.suite_id ?? config.suiteId;
      if (suite !== undefined) input.suite_id = suite;
      if (caseList) input.case_ids = caseList;
      if (description !== undefined) input.description = description;
      const milestoneToSet = milestone ?? source?.milestone_id ?? undefined;
      if (milestoneToSet !== undefined) input.milestone_id = milestoneToSet;
      if (refs.length > 0) input.refs = joinRefs(refs);
      if (assignee) input.assignedto_id = assignee.id;
      const created = await new RunService().add(config.projectId, input);
      const view = {
        ...toRunSummary(created, statuses),
        includeAll: created.include_all,
        assignedTo: assigneeView(assignee),
        jira: jiraView(ticket),
        fromRun: source ? { id: source.id, name: source.name, planId: source.plan_id } : null,
      };
      printResult(mode, view, () =>
        [
          `Created R${view.id}  ${view.name}`,
          table([
            ["Tests", renderCounts(view.counts)],
            ...(view.fromRun ? [["From", fromRunLabel(view.fromRun)] as const] : []),
            ...(view.assignedTo ? [["Assigned", view.assignedTo.name] as const] : []),
            ["URL", view.url],
          ]),
        ].join("\n\n"),
      );
    });
}

/** Ids of the cases linked to the key; a run of none would be empty. */
export async function linkedCases(
  projectId: number,
  suiteId: number | undefined,
  key: string,
): Promise<number[]> {
  const ids = await new CaseService().linkedTo(projectId, suiteId, key);
  if (ids.length === 0) {
    throw new InputError(
      "NO_LINKED_CASES",
      `No case in this project${suiteId === undefined ? "" : " and suite"} has ${key} in its refs. Link some with \`testrail link add C12 ${key}\`, or pass --cases.`,
    );
  }
  return ids;
}

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
  meta: MetaService,
): Promise<{ source: Run; caseIds: number[] }> {
  const typed = status ?? RERUN_STATUSES;
  const [source, statusIds] = await Promise.all([new RunService().get(id), meta.statusIds(typed)]);
  if (statusIds.length === 0) throw new InputError("USAGE", "Give at least one status name");
  const ids = [...new Set((await new TestService().all(id, statusIds)).map((item) => item.case_id))];
  if (ids.length === 0) {
    throw new InputError("NO_MATCHING_TESTS", `Run R${id} has no tests with status ${typed}.`);
  }
  return { source, caseIds: ids };
}

const fromRunLabel = (from: { id: number; name: string; planId: number | null }): string =>
  `R${from.id}  ${from.name}${from.planId === null ? "" : ` (in plan R${from.planId})`}`;
