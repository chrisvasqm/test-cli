import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { milestoneId } from "../../providers/testrail/ids.js";
import { dateArg, requireName } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { readOptionalText } from "../../core/input.js";
import { printResult, table } from "../../core/output.js";
import { joinRefs, splitList, uniqueRefs } from "../../core/text.js";
import type { MilestoneInput } from "../../providers/types.js";
import { milestoneRows, toMilestoneView } from "./render.js";

interface CreateOptions {
  name?: string;
  description?: string;
  file?: string;
  start?: string;
  due?: string;
  parent?: string;
  refs?: string;
}

export function registerCreate(milestone: Command): void {
  milestone
    .command("create")
    .description("Create a milestone in the project from the config")
    .option("-na, --name <name>", "Milestone name (required)")
    .option("-d, --description <text>", "Description (Markdown)")
    .option("-f, --file <path>", "Read the description from a file (- reads stdin)")
    .option("-sd, --start <date>", "Start date, e.g. 2026-11-01")
    .option("-du, --due <date>", "Due date, e.g. 2026-11-30")
    .option("-pa, --parent <milestone>", "Make it a sub-milestone of this milestone, e.g. M3")
    .option("-r, --refs <keys>", "References, comma-separated (e.g. KAN-1)")
    .action(async (opts: CreateOptions, cmd: Command) => {
      requireName(opts.name, "milestone");
      const input: MilestoneInput = { name: opts.name };
      if (opts.start !== undefined) input.start_on = dateArg(opts.start, "--start");
      if (opts.due !== undefined) input.due_on = dateArg(opts.due, "--due");
      if (opts.parent !== undefined) input.parent_id = milestoneId(opts.parent);
      const refs = joinRefs(uniqueRefs(splitList(opts.refs)));
      if (refs) input.refs = refs;
      const description = await readOptionalText(opts.description, opts.file, "description");
      if (description !== undefined) input.description = description;
      const { config, mode } = bootstrap(cmd);
      const view = toMilestoneView(await provider().milestones.add(config.projectId, input));
      printResult(mode, view, () =>
        [`Created M${view.id}  ${view.name}`, table(milestoneRows(view))].join("\n\n"),
      );
    });
}
