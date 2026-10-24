import type { Command } from "commander";
import { caseIdList } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { CaseService } from "../../services/case.service.js";
import { MetaService } from "../../services/meta.service.js";
import { caseUrl } from "../render.js";
import { addCaseFieldOptions, toCaseInput, type CaseFieldOptions } from "./fields.js";

/** Fields that only make sense per case, so update_cases (one value for all) does not get them. */
const PER_CASE: (keyof CaseFieldOptions)[] = ["title", "preconds", "steps", "expected", "step"];

export function registerEdit(testCase: Command): void {
  const cmd = testCase
    .command("edit <cases...>")
    .description(
      "Change cases' fields, e.g. C12, or C1 C2 for the same values on many; fields left out stay as they are",
    )
    .option("-t, --title <title>", "New title (one case only)");
  addCaseFieldOptions(cmd).action(async (rawIds: string[], opts: CaseFieldOptions, command: Command) => {
    const ids = caseIdList(rawIds);
    const perCase = PER_CASE.filter((field) => opts[field] !== undefined);
    if (ids.length > 1 && perCase.length > 0) {
      throw new InputError(
        "USAGE",
        `With several cases, only --type, --priority, --refs and --estimate can change; edit each case for: ${perCase.map((field) => `--${field}`).join(", ")}`,
      );
    }
    const { config, mode } = bootstrap(command);
    const { input, changed } = await toCaseInput(opts, new MetaService(), config.projectId);
    if (changed.length === 0)
      throw new InputError("USAGE", "Give at least one field to change, e.g. --title");
    const cases = new CaseService();
    if (ids.length === 1) {
      const updated = await cases.update(ids[0]!, input);
      const view = { id: updated.id, title: updated.title, changed, url: caseUrl(config, updated.id) };
      printResult(mode, view, () => `Updated C${view.id}  ${view.title}\n${view.url}`);
      return;
    }
    const found = await cases.getMany(ids);
    const suites = new Set(found.map((item) => item.suite_id));
    if (suites.size > 1) {
      throw new InputError(
        "USAGE",
        "The cases are in different suites; edit each suite's cases on their own",
      );
    }
    await cases.updateMany(found[0]!.suite_id, ids, input);
    const view = {
      cases: found.map((item) => ({ id: item.id, title: item.title, url: caseUrl(config, item.id) })),
      changed,
    };
    printResult(mode, view, () =>
      [
        `Updated ${view.cases.length} cases (${changed.join(", ")})`,
        ...view.cases.map((item) => `  C${item.id}  ${item.title}`),
      ].join("\n"),
    );
  });
}
