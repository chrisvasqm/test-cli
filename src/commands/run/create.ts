import type { Command } from "commander";
import { caseIds, milestoneId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { readOptionalText } from "../../core/input.js";
import { printResult, table } from "../../core/output.js";
import { clip, joinRefs, MAX_NAME } from "../../core/text.js";
import { CaseService } from "../../services/case.service.js";
import { MetaService } from "../../services/meta.service.js";
import { RunService, type RunInput } from "../../services/run.service.js";
import { UserService } from "../../services/user.service.js";
import { fromJiraKey, jiraView, loadFromJira } from "../from-jira.js";
import { renderCounts, toRunSummary } from "../render.js";

interface CreateOptions {
  name?: string;
  fromJira?: string;
  cases?: string;
  description?: string;
  file?: string;
  refs?: string;
  milestone?: string;
  assign?: string;
}

export function registerCreate(run: Command): void {
  run
    .command("create")
    .description("Create a run in the project (and suite) from the config")
    .option("-N, --name <name>", "Run name (required unless --from-jira)")
    .option(
      "-J, --from-jira <key>",
      'Run the cases linked to this Jira ticket; name "KAN-12: <summary>", key in refs (needs jira-cli)',
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
      const key = fromJiraKey(opts.fromJira, opts.name, "--name");
      const description = await readOptionalText(opts.description, opts.file, "description");
      const { config, mode } = bootstrap(cmd);
      // Jira first, alone: it may prompt for `jira setup`. Then the TestRail lookups, all before the
      // write; statuses too, as a failed lookup after it would report an error for a run that exists.
      const { ticket, refs } = await loadFromJira(key, opts.refs);
      const [caseList, statuses, assignee] = await Promise.all([
        cases ?? (key === undefined ? undefined : linkedCases(config.projectId, config.suiteId, key)),
        new MetaService().statuses(),
        opts.assign === undefined
          ? undefined
          : new UserService().resolve(opts.assign, config.email, "--assign"),
      ]);
      const name = opts.name ?? clip(`${ticket?.key}: ${ticket?.summary}`, MAX_NAME);
      const input: RunInput = { name, include_all: caseList === undefined };
      if (config.suiteId !== undefined) input.suite_id = config.suiteId;
      if (caseList) input.case_ids = caseList;
      if (description !== undefined) input.description = description;
      if (milestone !== undefined) input.milestone_id = milestone;
      if (refs.length > 0) input.refs = joinRefs(refs);
      if (assignee) input.assignedto_id = assignee.id;
      const created = await new RunService().add(config.projectId, input);
      const view = {
        ...toRunSummary(created, statuses),
        includeAll: created.include_all,
        assignedTo: assignee ? { id: assignee.id, name: assignee.name } : null,
        jira: jiraView(ticket),
      };
      printResult(mode, view, () =>
        [
          `Created R${view.id}  ${view.name}`,
          table([
            ["Tests", renderCounts(view.counts)],
            ...(view.assignedTo ? [["Assigned", view.assignedTo.name] as const] : []),
            ["URL", view.url],
          ]),
        ].join("\n\n"),
      );
    });
}

/** Ids of the cases linked to the key; a run of none would be empty. */
async function linkedCases(projectId: number, suiteId: number | undefined, key: string): Promise<number[]> {
  const ids = await new CaseService().linkedTo(projectId, suiteId, key);
  if (ids.length === 0) {
    throw new InputError(
      "NO_LINKED_CASES",
      `No case in this project${suiteId === undefined ? "" : " and suite"} has ${key} in its refs. Link some with \`testrail link add C12 ${key}\`, or pass --cases.`,
    );
  }
  return ids;
}
