import type { Command } from "commander";
import { intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult } from "../../core/output.js";
import { CaseService } from "../../services/case.service.js";
import { MetaService } from "../../services/meta.service.js";
import { caseUrl } from "../render.js";
import { addCaseFieldOptions, toCaseInput, type CaseFieldOptions } from "./fields.js";

interface CreateOptions extends CaseFieldOptions {
  section: string;
  title: string;
}

export function registerCreate(testCase: Command): void {
  const cmd = testCase
    .command("create")
    .description("Create a case in a section (section ids: testrail section list)")
    .requiredOption("--section <id>", "Section to add the case to")
    .requiredOption("--title <title>", "Case title");
  addCaseFieldOptions(cmd).action(async (opts: CreateOptions, command: Command) => {
    const sectionId = intInRange(opts.section, "--section", 1);
    const { config, mode } = bootstrap(command);
    const { input } = await toCaseInput(opts, new MetaService(), config.projectId);
    const created = await new CaseService().add(sectionId, { ...input, title: input.title ?? opts.title });
    const view = {
      id: created.id,
      title: created.title,
      sectionId: created.section_id,
      url: caseUrl(config, created.id),
    };
    printResult(mode, view, () => `Created C${view.id}  ${view.title}\n${view.url}`);
  });
}
