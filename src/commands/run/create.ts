import type { Command } from "commander";
import { caseIds, intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { readOptionalText } from "../../core/input.js";
import { jiraTicket } from "../../core/jira.js";
import { printResult, table } from "../../core/output.js";
import { clip, MAX_NAME, splitList, uniqueRefs } from "../../core/text.js";
import { CaseService } from "../../services/case.service.js";
import { MetaService } from "../../services/meta.service.js";
import { RunService, type RunInput } from "../../services/run.service.js";
import { jiraKey } from "../link/target.js";
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
      const key = opts.fromJira === undefined ? undefined : jiraKey(opts.fromJira, "--from-jira");
      if (key === undefined && opts.name === undefined) {
        throw new InputError("USAGE", "Give --name, or --from-jira KAN-12 to take it from Jira");
      }
      const description = await readOptionalText(opts.description, opts.file, "description");
      const { config, mode } = bootstrap(cmd);
      const ticket = key === undefined ? undefined : await jiraTicket(key);
      const caseList =
        cases ??
        (ticket
          ? await new CaseService().linkedIds(config.projectId, config.suiteId, ticket.key)
          : undefined);
      const name = opts.name ?? clip(`${ticket?.key}: ${ticket?.summary}`, MAX_NAME);
      const input: RunInput = { name, include_all: caseList === undefined };
      if (config.suiteId !== undefined) input.suite_id = config.suiteId;
      if (caseList) input.case_ids = caseList;
      if (description !== undefined) input.description = description;
      if (milestone !== undefined) input.milestone_id = milestone;
      const refs = ticket ? uniqueRefs([ticket.key, ...splitList(opts.refs)]) : splitList(opts.refs);
      if (refs.length > 0) input.refs = refs.join(",");
      // Statuses first: a failed lookup after the write would report an error for a run that exists.
      const statuses = await new MetaService().statuses();
      const created = await new RunService().add(config.projectId, input);
      const view = {
        ...toRunSummary(created, statuses),
        includeAll: created.include_all,
        jira: ticket ? { key: ticket.key, url: ticket.url } : null,
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
