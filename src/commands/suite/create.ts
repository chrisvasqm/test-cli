import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { requireName } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { readOptionalText } from "../../core/input.js";
import { printResult } from "../../core/output.js";
import type { SuiteInput } from "../../providers/types.js";

interface CreateOptions {
  name?: string;
  description?: string;
  file?: string;
}

export function registerCreate(suite: Command): void {
  suite
    .command("create")
    .description("Create a suite in the project from the config (multi-suite projects only)")
    .option("-na, --name <name>", "Suite name (required)")
    .option("-d, --description <text>", "Description (Markdown)")
    .option("-f, --file <path>", "Read the description from a file (- reads stdin)")
    .action(async (opts: CreateOptions, cmd: Command) => {
      requireName(opts.name, "suite");
      const description = await readOptionalText(opts.description, opts.file, "description");
      const { config, mode } = bootstrap(cmd);
      const input: SuiteInput = { name: opts.name };
      if (description !== undefined) input.description = description;
      const created = await provider().suites.add(config.projectId, input);
      const view = { id: created.id, name: created.name, url: created.url };
      printResult(mode, view, () => `Created S${view.id}  ${view.name}\n${view.url}`);
    });
}
