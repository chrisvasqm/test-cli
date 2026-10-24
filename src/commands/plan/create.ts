import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { milestoneId } from "../../providers/testrail/ids.js";
import { requireName } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { readOptionalText } from "../../core/input.js";
import { printResult } from "../../core/output.js";
import type { PlanInput } from "../../providers/types.js";
import { jiraView } from "../from-jira.js";
import { buildEntry, entryOptions, hasEntry, parseEntry, type EntryOptions } from "./entry.js";
import { renderPlan, toPlanView } from "./render.js";

interface CreateOptions extends EntryOptions {
  name?: string;
  description?: string;
  file?: string;
  milestone?: string;
}

export function registerCreate(plan: Command): void {
  const create = plan
    .command("create")
    .description("Create a test plan in the project; any run flag also adds its first runs")
    .option("-na, --name <name>", "Plan name (required)")
    .option("-d, --description <text>", "Description (Markdown)")
    .option("-f, --file <path>", "Read the description from a file (- reads stdin)")
    .option("-ml, --milestone <milestone>", "Milestone, e.g. M3");
  entryOptions(create).action(async (opts: CreateOptions, cmd: Command) => {
    requireName(opts.name, "plan");
    const input: PlanInput = { name: opts.name };
    if (opts.milestone !== undefined) input.milestone_id = milestoneId(opts.milestone);
    const parsed = parseEntry(opts);
    const description = await readOptionalText(opts.description, opts.file, "description");
    if (description !== undefined) input.description = description;
    const { config, mode } = bootstrap(cmd);
    const entry = hasEntry(opts)
      ? await buildEntry(opts, parsed, config, undefined, "plan create")
      : undefined;
    if (entry) input.entries = [entry.input];
    // Statuses before the write: a failed lookup after it would report an error for a plan that exists.
    const statuses = await provider().meta.statuses();
    const view = {
      ...toPlanView(await provider().plans.add(config.projectId, input), statuses),
      jira: jiraView(entry?.ticket),
    };
    printResult(mode, view, () => renderPlan(view, "Created"));
  });
}
