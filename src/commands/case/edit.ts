import type { Command } from "commander";
import { caseId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { CaseService } from "../../services/case.service.js";
import { MetaService } from "../../services/meta.service.js";
import { caseUrl } from "../render.js";
import { addCaseFieldOptions, toCaseInput, type CaseFieldOptions } from "./fields.js";

export function registerEdit(testCase: Command): void {
  const cmd = testCase
    .command("edit <case>")
    .description("Change a case's fields, e.g. C12; fields left out stay as they are")
    .option("--title <title>", "New title");
  addCaseFieldOptions(cmd).action(async (rawId: string, opts: CaseFieldOptions, command: Command) => {
    const id = caseId(rawId);
    const { config, mode } = bootstrap(command);
    const input = await toCaseInput(opts, new MetaService(), config.projectId);
    const changed = Object.keys(input).filter((key) => key !== "template_id");
    if (changed.length === 0) throw new CliError("USAGE", "Give at least one field to change, e.g. --title");
    const updated = await new CaseService().update(id, input);
    const view = { id: updated.id, title: updated.title, changed, url: caseUrl(config, updated.id) };
    printResult(mode, view, () => `Updated C${view.id}  ${view.title}\n${view.url}`);
  });
}
