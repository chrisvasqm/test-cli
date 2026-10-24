import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { suiteId } from "../../providers/testrail/ids.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { readOptionalText } from "../../core/input.js";
import { printResult } from "../../core/output.js";
import type { SuiteInput } from "../../providers/types.js";

interface EditOptions {
  name?: string;
  description?: string;
  file?: string;
}

export function registerEdit(suite: Command): void {
  suite
    .command("edit <suite>")
    .description("Change a suite's name or description, e.g. S3; fields left out stay as they are")
    .option("-na, --name <name>", "New name")
    .option("-d, --description <text>", "New description (Markdown)")
    .option("-f, --file <path>", "Read the description from a file (- reads stdin)")
    .action(async (rawId: string, opts: EditOptions, cmd: Command) => {
      const id = suiteId(rawId);
      if (opts.name?.trim() === "") throw new InputError("USAGE", "The name is empty");
      const description = await readOptionalText(opts.description, opts.file, "description");
      const input: Partial<SuiteInput> = {};
      if (opts.name !== undefined) input.name = opts.name;
      if (description !== undefined) input.description = description;
      const changed = Object.keys(input);
      if (changed.length === 0)
        throw new InputError("USAGE", "Give at least one field to change, e.g. --name");
      const { mode } = bootstrap(cmd);
      const updated = await provider().suites.update(id, input);
      const view = { id: updated.id, name: updated.name, changed, url: updated.url };
      printResult(mode, view, () => `Updated S${view.id}  ${view.name}\n${view.url}`);
    });
}
