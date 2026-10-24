import type { Command } from "commander";
import { dateArg, milestoneId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { readOptionalText } from "../../core/input.js";
import { printResult, table } from "../../core/output.js";
import { joinRefs, splitList, uniqueRefs } from "../../core/text.js";
import { MilestoneService, type MilestoneUpdate } from "../../services/milestone.service.js";
import { milestoneRows, toMilestoneView } from "./view.js";

interface EditOptions {
  name?: string;
  description?: string;
  file?: string;
  start?: string;
  due?: string;
  parent?: string;
  refs?: string;
  started?: boolean;
}

export function registerEdit(milestone: Command): void {
  milestone
    .command("edit <milestone>")
    .description("Change a milestone's fields, e.g. M3; fields left out stay as they are")
    .option("-na, --name <name>", "New name")
    .option("-d, --description <text>", "New description (Markdown)")
    .option("-f, --file <path>", "Read the description from a file (- reads stdin)")
    .option("-sd, --start <date>", "Start date, e.g. 2026-11-01; makes the milestone upcoming (not started)")
    .option("-du, --due <date>", "Due date, e.g. 2026-11-30")
    .option("-pa, --parent <milestone>", "Make it a sub-milestone of this milestone, e.g. M3")
    .option("-r, --refs <keys>", "Replace the references, comma-separated (e.g. KAN-1)")
    .option("-sr, --started", "Mark it started")
    .action(async (rawId: string, opts: EditOptions, cmd: Command) => {
      const id = milestoneId(rawId);
      if (opts.start !== undefined && opts.started) {
        throw new InputError(
          "USAGE",
          "Give --start or --started, not both: only an upcoming milestone has a start date",
        );
      }
      const input: MilestoneUpdate = {};
      if (opts.name !== undefined) input.name = opts.name;
      // TestRail takes a start date only for an upcoming (not started) milestone.
      if (opts.start !== undefined) {
        input.start_on = dateArg(opts.start, "--start");
        input.is_started = false;
      }
      if (opts.due !== undefined) input.due_on = dateArg(opts.due, "--due");
      if (opts.parent !== undefined) input.parent_id = milestoneId(opts.parent);
      if (opts.refs !== undefined) input.refs = joinRefs(uniqueRefs(splitList(opts.refs)));
      if (opts.started) input.is_started = true;
      const description = await readOptionalText(opts.description, opts.file, "description");
      if (description !== undefined) input.description = description;
      if (Object.keys(input).length === 0) {
        throw new InputError("USAGE", "Give at least one field to change, e.g. --name or --due");
      }
      const { mode } = bootstrap(cmd);
      const updated = await new MilestoneService().update(id, input);
      const view = { ...toMilestoneView(updated), changed: Object.keys(input) };
      printResult(mode, view, () =>
        [`Updated M${view.id}  ${view.name}`, table(milestoneRows(view))].join("\n\n"),
      );
    });
}
