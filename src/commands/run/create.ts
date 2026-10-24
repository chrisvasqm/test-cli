import type { Command } from "commander";
import { caseIds, intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { readOptionalText } from "../../core/input.js";
import { printResult, table } from "../../core/output.js";
import { clip, joinRefs, MAX_NAME } from "../../core/text.js";
import { CaseService } from "../../services/case.service.js";
import { MetaService } from "../../services/meta.service.js";
import { RunService, type RunInput } from "../../services/run.service.js";
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
}

export function registerCreate(run: Command): void {
  run
    .command("create")
    .description("Create a run in the project (and suite) from the config")
    .option("--name <name>", "Run name (required unless --from-jira)")
    .option(
      "--from-jira <key>",
      'Run the cases linked to this Jira ticket; name "KAN-12: <summary>", key in refs (needs jira-cli)',
    )
    .option("--cases <ids>", "Only these cases, comma-separated (e.g. C1,C2); default: every case")
    .option("--description <text>", "Description (Markdown)")
    .option("--file <path>", "Read the description from a file (- reads stdin)")
    .option("--refs <keys>", "References, comma-separated (e.g. KAN-1)")
    .option("--milestone <id>", "Milestone id")
    .action(async (opts: CreateOptions, cmd: Command) => {
      const cases = opts.cases === undefined ? undefined : caseIds(opts.cases);
      const milestone =
        opts.milestone === undefined ? undefined : intInRange(opts.milestone, "--milestone", 1);
      const key = fromJiraKey(opts.fromJira, opts.name, "--name");
      const description = await readOptionalText(opts.description, opts.file, "description");
      const { config, mode } = bootstrap(cmd);
      // Jira first, alone: it may prompt for `jira setup`. Then the TestRail lookups, all before the
      // write; statuses too, as a failed lookup after it would report an error for a run that exists.
      const { ticket, refs } = await loadFromJira(key, opts.refs);
      const [caseList, statuses] = await Promise.all([
        cases ?? (key === undefined ? undefined : linkedCases(config.projectId, config.suiteId, key)),
        new MetaService().statuses(),
      ]);
      const name = opts.name ?? clip(`${ticket?.key}: ${ticket?.summary}`, MAX_NAME);
      const input: RunInput = { name, include_all: caseList === undefined };
      if (config.suiteId !== undefined) input.suite_id = config.suiteId;
      if (caseList) input.case_ids = caseList;
      if (description !== undefined) input.description = description;
      if (milestone !== undefined) input.milestone_id = milestone;
      if (refs.length > 0) input.refs = joinRefs(refs);
      const created = await new RunService().add(config.projectId, input);
      const view = {
        ...toRunSummary(created, statuses),
        includeAll: created.include_all,
        jira: jiraView(ticket),
      };
      printResult(mode, view, () =>
        [
          `Created R${view.id}  ${view.name}`,
          table([
            ["Tests", renderCounts(view.counts)],
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
