import type { Command } from "commander";
import { caseId, runId, testId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { readOptionalText } from "../../core/input.js";
import { printResult } from "../../core/output.js";
import { MetaService } from "../../services/meta.service.js";
import { ResultService } from "../../services/result.service.js";
import { renderResult, testUrl, toResult } from "../render.js";
import { toResultInput } from "./fields.js";

interface AddOptions {
  status?: string;
  comment?: string;
  file?: string;
  defects?: string;
  elapsed?: string;
  build?: string;
  run?: string;
  case?: string;
}

export function registerAdd(result: Command): void {
  result
    .command("add [test]")
    .description("Add a result to a test (T45), or to a case in a run with --run and --case")
    .option("--status <name>", "Status, e.g. passed, failed, blocked, retest")
    .option("--comment <text>", "Comment (Markdown)")
    .option("--file <path>", "Read the comment from a file (- reads stdin)")
    .option("--defects <keys>", "Defect keys, comma-separated (e.g. KAN-2,KAN-3)")
    .option("--elapsed <time>", "Time spent, e.g. 1m 45s")
    .option("--build <version>", "Build or version tested (--version is the CLI's own)")
    .option("--run <run>", "Run of the case, e.g. R3 (with --case, instead of a test id)")
    .option("--case <case>", "Case in that run, e.g. C12")
    .action(async (rawTest: string | undefined, opts: AddOptions, cmd: Command) => {
      const target = parseTarget(rawTest, opts);
      const comment = await readOptionalText(opts.comment, opts.file, "comment");
      const { config, mode } = bootstrap(cmd);
      const meta = new MetaService();
      // Statuses before the write: a failed lookup after it would report an error for a saved result.
      const statuses = await meta.statuses();
      const input = await toResultInput({ ...opts, comment, version: opts.build }, meta, "result");
      const results = new ResultService();
      const added =
        target.kind === "test"
          ? await results.addForTest(target.testId, input)
          : await results.addForCase(target.runId, target.caseId, input);
      const view = {
        ...toResult(added, statuses),
        testId: added.test_id,
        url: testUrl(config, added.test_id),
      };
      printResult(
        mode,
        view,
        () => `Added result #${view.id} to T${view.testId}\n${renderResult(view)}\n${view.url}`,
      );
    });
}

type Target = { kind: "test"; testId: number } | { kind: "case"; runId: number; caseId: number };

function parseTarget(rawTest: string | undefined, opts: AddOptions): Target {
  const byCase = opts.run !== undefined || opts.case !== undefined;
  if (rawTest !== undefined && byCase)
    throw new InputError("USAGE", "Give a test id or --run with --case, not both");
  if (rawTest !== undefined) return { kind: "test", testId: testId(rawTest) };
  if (opts.run === undefined || opts.case === undefined) {
    throw new InputError("USAGE", "Give a test id (T45), or both --run R3 and --case C12");
  }
  return { kind: "case", runId: runId(opts.run), caseId: caseId(opts.case) };
}
