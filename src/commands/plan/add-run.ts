import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { planId } from "../../providers/testrail/ids.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult } from "../../core/output.js";
import { jiraView } from "../from-jira.js";
import { assigneeView } from "../render.js";
import { buildEntry, entryOptions, parseEntry, type EntryOptions } from "./entry.js";
import { renderEntry, toEntryView } from "./render.js";

interface AddRunOptions extends EntryOptions {
  name?: string;
}

export function registerAddRun(plan: Command): void {
  const addRun = plan
    .command("add-run <plan>")
    .description("Add a suite's runs to an open plan, e.g. R7: one run, or one per configuration combination")
    .option(
      "-na, --name <name>",
      'Name of the runs (default: the suite\'s, or "KAN-12: <summary>" with -fj)',
    );
  entryOptions(addRun).action(async (rawId: string, opts: AddRunOptions, cmd: Command) => {
    const id = planId(rawId);
    const parsed = parseEntry(opts);
    const { config, mode } = bootstrap(cmd, "plans");
    const { input, ticket, assignee } = await buildEntry(opts, parsed, config, opts.name, "plan add-run");
    const statuses = await provider().meta.statuses();
    const entry = toEntryView(await provider().plans.addEntry(id, input), statuses);
    const view = {
      planId: id,
      ...entry,
      includeAll: input.include_all,
      assignedTo: assigneeView(assignee),
      jira: jiraView(ticket),
    };
    printResult(mode, view, () => `Added to R${id}\n\n${renderEntry(entry)}`);
  });
}
