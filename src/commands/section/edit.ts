import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { readOptionalText } from "../../core/input.js";
import { printResult } from "../../core/output.js";
import type { SectionInput } from "../../providers/types.js";
import { toSectionView } from "./render.js";

interface EditOptions {
  name?: string;
  description?: string;
  file?: string;
}

export function registerEdit(section: Command): void {
  section
    .command("edit <section>")
    .description("Rename a section or change its description; fields left out stay as they are")
    .option("-na, --name <name>", "New name")
    .option("-d, --description <text>", "New description (Markdown)")
    .option("-f, --file <path>", "Read the description from a file (- reads stdin)")
    .action(async (rawId: string, opts: EditOptions, cmd: Command) => {
      const id = intInRange(rawId, "<section>", 1);
      const description = await readOptionalText(opts.description, opts.file, "description");
      const input: Partial<Pick<SectionInput, "name" | "description">> = {};
      if (opts.name !== undefined) input.name = opts.name;
      if (description !== undefined) input.description = description;
      if (Object.keys(input).length === 0)
        throw new InputError("USAGE", "Give at least one field to change, e.g. --name");
      const { mode } = bootstrap(cmd);
      const view = toSectionView(await provider().sections.update(id, input));
      printResult(mode, view, () => `Updated section ${view.id}  ${view.name}`);
    });
}
