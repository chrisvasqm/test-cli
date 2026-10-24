import type { Command } from "commander";
import { caseIds, intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { readOptionalText } from "../../core/input.js";
import { printResult, table } from "../../core/output.js";
import { splitRefs } from "../../core/text.js";
import { MetaService } from "../../services/meta.service.js";
import { RunService, type RunInput } from "../../services/run.service.js";
import { renderCounts, runCounts } from "../render.js";

interface CreateOptions {
  name: string;
  cases?: string;
  description?: string;
  file?: string;
  refs?: string;
  milestone?: string;
}

export function registerCreate(run: Command): void {
  run
    .command("create")
    .description("Create a run in the project (and suite) from the config")
    .requiredOption("--name <name>", "Run name")
    .option("--cases <ids>", "Only these cases, comma-separated (e.g. C1,C2); default: every case")
    .option("--description <text>", "Description (Markdown)")
    .option("--file <path>", "Read the description from a file (- reads stdin)")
    .option("--refs <keys>", "References, comma-separated (e.g. KAN-1)")
    .option("--milestone <id>", "Milestone id")
    .action(async (opts: CreateOptions, cmd: Command) => {
      const cases = opts.cases === undefined ? undefined : caseIds(opts.cases);
      const milestone =
        opts.milestone === undefined ? undefined : intInRange(opts.milestone, "--milestone", 1);
      const description = await readOptionalText(opts.description, opts.file, "description");
      const { config, mode } = bootstrap(cmd);
      const input: RunInput = { name: opts.name, include_all: cases === undefined };
      if (config.suiteId !== undefined) input.suite_id = config.suiteId;
      if (cases) input.case_ids = cases;
      if (description !== undefined) input.description = description;
      if (milestone !== undefined) input.milestone_id = milestone;
      const refs = splitRefs(opts.refs);
      if (refs.length > 0) input.refs = refs.join(",");
      const [created, statuses] = await Promise.all([
        new RunService().add(config.projectId, input),
        new MetaService().statuses(),
      ]);
      const view = {
        id: created.id,
        name: created.name,
        url: created.url,
        includeAll: created.include_all,
        counts: runCounts(created, statuses),
      };
      printResult(mode, view, () =>
        [
          `Created R${view.id}  ${view.name}`,
          table([
            ["Tests", renderCounts(view.counts)],
            ["URL", view.url],
          ]),
        ].join("\n\n"),
      );
    });
}
