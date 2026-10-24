import type { Command } from "commander";
import { intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { jiraTicket } from "../../core/jira.js";
import { printResult } from "../../core/output.js";
import { splitList, uniqueRefs } from "../../core/text.js";
import { CaseService } from "../../services/case.service.js";
import { MetaService } from "../../services/meta.service.js";
import { jiraKey } from "../link/target.js";
import { caseUrl } from "../render.js";
import { addCaseFieldOptions, toCaseInput, type CaseFieldOptions } from "./fields.js";

interface CreateOptions extends CaseFieldOptions {
  section: string;
  title?: string;
  fromJira?: string;
}

export function registerCreate(testCase: Command): void {
  const cmd = testCase
    .command("create")
    .description("Create a case in a section (section ids: testrail section list)")
    .requiredOption("--section <id>", "Section to add the case to")
    .option("--title <title>", "Case title (required unless --from-jira)")
    .option(
      "--from-jira <key>",
      "Title from this Jira ticket's summary, and the key in refs (needs jira-cli)",
    );
  addCaseFieldOptions(cmd).action(async (opts: CreateOptions, command: Command) => {
    const sectionId = intInRange(opts.section, "--section", 1);
    const key = opts.fromJira === undefined ? undefined : jiraKey(opts.fromJira, "--from-jira");
    if (key === undefined && opts.title === undefined) {
      throw new InputError("USAGE", "Give --title, or --from-jira KAN-12 to take it from Jira");
    }
    const { config, mode } = bootstrap(command);
    const ticket = key === undefined ? undefined : await jiraTicket(key);
    const fields: CaseFieldOptions = { ...opts };
    if (ticket) {
      fields.title = opts.title ?? ticket.summary;
      fields.refs = uniqueRefs([ticket.key, ...splitList(opts.refs)]).join(",");
    }
    const { input } = await toCaseInput(fields, new MetaService(), config.projectId);
    const created = await new CaseService().add(sectionId, { ...input, title: input.title ?? "" });
    const view = {
      id: created.id,
      title: created.title,
      sectionId: created.section_id,
      jira: ticket ? { key: ticket.key, url: ticket.url } : null,
      url: caseUrl(config, created.id),
    };
    printResult(mode, view, () => `Created C${view.id}  ${view.title}\n${view.url}`);
  });
}
