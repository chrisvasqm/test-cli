import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { type SectionMove } from "../../providers/testrail/services/section.service.js";
import { toSectionView } from "./render.js";

interface MoveOptions {
  parent?: string;
  after?: string;
}

export function registerMove(section: Command): void {
  section
    .command("move <section>")
    .description("Move a section, with its child sections and cases, to another parent or place")
    .option("-pa, --parent <id>", 'New parent section, or "top" for the top level')
    .option("-af, --after <id>", 'Put it after this sibling section, or "first" for the first place')
    .action(async (rawId: string, opts: MoveOptions, cmd: Command) => {
      const id = intInRange(rawId, "<section>", 1);
      const input: SectionMove = {};
      if (opts.parent !== undefined) input.parent_id = idOr(opts.parent, "top", "--parent");
      if (opts.after !== undefined) input.after_id = idOr(opts.after, "first", "--after");
      if (Object.keys(input).length === 0)
        throw new InputError("USAGE", "Give --parent, --after or both, e.g. --parent top");
      const { mode } = bootstrap(cmd);
      const view = toSectionView(await provider().sections.move(id, input));
      printResult(mode, view, () => `Moved section ${view.id}  ${view.name}`);
    });
}

/** A section id, or the word `none` stands for (TestRail's null). */
function idOr(raw: string, none: string, flag: string): number | null {
  return raw.trim().toLowerCase() === none ? null : intInRange(raw, flag, 1);
}
