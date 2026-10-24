import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { readOptionalText } from "../../core/input.js";
import { printResult } from "../../core/output.js";
import type { SectionInput } from "../../providers/testrail/services/section.service.js";
import { toSectionView } from "./render.js";

interface CreateOptions {
  name: string;
  parent?: string;
  description?: string;
  file?: string;
}

export function registerCreate(section: Command): void {
  section
    .command("create")
    .description("Create a section in the project (and suite) from the config")
    .requiredOption("-na, --name <name>", "Section name")
    .option("-pa, --parent <id>", "Parent section (ids: test-cli section list); default: top level")
    .option("-d, --description <text>", "Description (Markdown)")
    .option("-f, --file <path>", "Read the description from a file (- reads stdin)")
    .action(async (opts: CreateOptions, cmd: Command) => {
      const parent = opts.parent === undefined ? undefined : intInRange(opts.parent, "--parent", 1);
      const description = await readOptionalText(opts.description, opts.file, "description");
      const { config, mode } = bootstrap(cmd);
      const input: SectionInput = { name: opts.name };
      if (config.suiteId !== undefined) input.suite_id = config.suiteId;
      if (parent !== undefined) input.parent_id = parent;
      if (description !== undefined) input.description = description;
      const view = toSectionView(await provider().sections.add(config.projectId, input));
      printResult(mode, view, () => `Created section ${view.id}  ${view.name}`);
    });
}
