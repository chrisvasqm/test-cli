import type { Command } from "commander";
import { caseId, runId, testId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError, InputError } from "../../core/errors.js";
import { readOptionalText } from "../../core/input.js";
import { createJiraBug, type JiraCreated } from "../../core/jira.js";
import { printResult } from "../../core/output.js";
import { MetaService } from "../../services/meta.service.js";
import type { Test } from "../../core/testrail-types.js";
import { ResultService, type ResultInput, type ResultTarget } from "../../services/result.service.js";
import { clip, joinRefs, MAX_SUMMARY, splitList } from "../../core/text.js";
import { renderResult, testUrl, toResult } from "../render.js";
import type { Config } from "../../core/config.js";
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
  createBug?: boolean;
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
    .option("--create-bug", "Create a Jira Bug first and add its key to --defects (needs jira-cli)")
    .action(async (rawTest: string | undefined, opts: AddOptions, cmd: Command) => {
      const target = parseTarget(rawTest, opts);
      const comment = await readOptionalText(opts.comment, opts.file, "comment");
      const { config, mode } = bootstrap(cmd);
      const meta = new MetaService();
      // Statuses before the write: a failed lookup after it would report an error for a saved result.
      const statuses = await meta.statuses();
      const input = await toResultInput({ ...opts, comment, version: opts.build }, meta, "result");
      const bug = opts.createBug
        ? await fileBug(config, await new ResultService().openTest(target), comment)
        : undefined;
      if (bug) input.defects = joinRefs([...splitList(input.defects), bug.key]);
      const added = await addResult(target, input).catch((err: unknown) => {
        // The bug exists now; say so, or a retry files a second one.
        if (!bug || !(err instanceof CliError)) throw err;
        throw new CliError(
          err.code,
          `${err.message} Jira bug ${bug.key} was already created (${bug.url}); retry with --defects ${bug.key}, not --create-bug.`,
          { bug, error: err.details },
          err.status,
          err.field,
        );
      });
      const view = {
        ...toResult(added, statuses),
        testId: added.test_id,
        bug: bug ? { key: bug.key, url: bug.url } : null,
        url: testUrl(config, added.test_id),
      };
      printResult(mode, view, () => {
        const filed = view.bug ? `\nCreated Jira bug ${view.bug.key}  ${view.bug.url}` : "";
        return `Added result #${view.id} to T${view.testId}${filed}\n${renderResult(view)}\n${view.url}`;
      });
    });
}

type Target = ResultTarget;

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

function addResult(target: Target, input: ResultInput) {
  const results = new ResultService();
  return target.kind === "test"
    ? results.addForTest(target.testId, input)
    : results.addForCase(target.runId, target.caseId, input);
}

/** A Jira Bug named after the test, with the comment and a link back to TestRail. */
async function fileBug(config: Config, test: Test, comment: string | undefined): Promise<JiraCreated> {
  const url = testUrl(config, test.id);
  const description = [comment, `TestRail test T${test.id}: ${url}`].filter(Boolean).join("\n\n");
  // Jira summaries hold 255 characters.
  return createJiraBug(clip(`T${test.id} failed: ${test.title}`, MAX_SUMMARY), description);
}
