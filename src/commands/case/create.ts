import type { Command } from "commander";
import { intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult } from "../../core/output.js";
import { clip, joinRefs, MAX_NAME } from "../../core/text.js";
import { CaseService } from "../../services/case.service.js";
import { MetaService } from "../../services/meta.service.js";
import { fromJiraKey, jiraView, loadFromJira } from "../from-jira.js";
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
    .requiredOption("-sc, --section <id>", "Section to add the case to")
    .option("-t, --title <title>", "Case title (required unless --from-jira)")
    .option(
      "-fj, --from-jira <key>",
      "Title from this Jira ticket's summary, and the key in refs (needs jira-cli)",
    );
  addCaseFieldOptions(cmd).action(async (opts: CreateOptions, command: Command) => {
    const sectionId = intInRange(opts.section, "--section", 1);
    const key = fromJiraKey(opts.fromJira, opts.title, "--title");
    const { config, mode } = bootstrap(command);
    const { ticket, refs } = await loadFromJira(key, opts.refs);
    const fields: CaseFieldOptions = { ...opts };
    if (ticket) {
      fields.title = opts.title ?? clip(ticket.summary, MAX_NAME);
      fields.refs = joinRefs(refs);
    }
    const { input } = await toCaseInput(fields, new MetaService(), config.projectId);
    const created = await new CaseService().add(sectionId, { ...input, title: input.title ?? "" });
    const view = {
      id: created.id,
      title: created.title,
      sectionId: created.section_id,
      jira: jiraView(ticket),
      url: caseUrl(config, created.id),
    };
    printResult(mode, view, () => `Created C${view.id}  ${view.title}\n${view.url}`);
  });
}
