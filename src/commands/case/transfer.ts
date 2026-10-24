import type { Command } from "commander";
import { caseIdList, intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult } from "../../core/output.js";
import type { Case } from "../../core/testrail-types.js";
import { CaseService } from "../../services/case.service.js";
import { SectionService } from "../../services/section.service.js";

interface TransferOptions {
  section: string;
}

/** Every case, fetched at once; the first unknown one fails with CASE_NOT_FOUND. */
export function loadCases(cases: CaseService, ids: number[]): Promise<Case[]> {
  return Promise.all(ids.map((id) => cases.get(id)));
}

export function registerCopy(testCase: Command): void {
  registerTransfer(
    testCase,
    "copy",
    "Copied",
    "Copy cases into a section, e.g. C1 C2 -s 4; the originals stay",
  );
}

export function registerMove(testCase: Command): void {
  registerTransfer(
    testCase,
    "move",
    "Moved",
    "Move cases into a section, e.g. C1 C2 -s 4; TestRail may refuse a move to another suite",
  );
}

function registerTransfer(testCase: Command, verb: "copy" | "move", done: string, description: string): void {
  testCase
    .command(`${verb} <cases...>`)
    .description(description)
    .requiredOption("-s, --section <id>", "Section to put the cases in (ids: testrail section list)")
    .action(async (rawIds: string[], opts: TransferOptions, cmd: Command) => {
      const ids = caseIdList(rawIds);
      const sectionId = intInRange(opts.section, "--section", 1);
      const { mode } = bootstrap(cmd);
      const cases = new CaseService();
      // Both checks run before the write, so it never half-starts on a typo.
      const [section, found] = await Promise.all([
        new SectionService().get(sectionId),
        loadCases(cases, ids),
      ]);
      await (verb === "copy"
        ? cases.copyTo(section.id, ids)
        : cases.moveTo(section.id, section.suite_id, ids));
      const view = {
        cases: found.map((item) => ({ id: item.id, title: item.title })),
        sectionId: section.id,
        section: section.name,
        suiteId: section.suite_id,
      };
      printResult(mode, view, () =>
        [
          `${done} ${view.cases.length} case(s) to section ${view.sectionId}  ${view.section}`,
          ...view.cases.map((item) => `  C${item.id}  ${item.title}`),
        ].join("\n"),
      );
    });
}
