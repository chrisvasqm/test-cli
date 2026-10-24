import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { caseId, runId, testId } from "../../providers/testrail/ids.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError, InputError } from "../../core/errors.js";
import { checkUploads, readOptionalText, type Upload } from "../../core/input.js";
import { createJiraBug, type JiraCreated } from "../../core/jira.js";
import { printResult } from "../../core/output.js";
import type { Status, Step, Test } from "../../providers/testrail/types.js";
import { type ResultInput, type ResultTarget } from "../../providers/testrail/services/result.service.js";
import { clip, joinRefs, MAX_SUMMARY, splitList } from "../../core/text.js";
import { renderResult, testUrl, toResult, assigneeView } from "../render.js";
import type { Config } from "../../core/config.js";
import { toResultInput } from "./fields.js";
import { parseStepList, toStepResults } from "./steps.js";
import { attached, renderAttached } from "../attachment/files.js";

interface AddOptions {
  attach: string[];
  status?: string;
  comment?: string;
  file?: string;
  defects?: string;
  elapsed?: string;
  build?: string;
  run?: string;
  case?: string;
  createBug?: boolean;
  assign?: string;
  steps?: string;
}

export function registerAdd(result: Command): void {
  result
    .command("add [test]")
    .description("Add a result to a test (T45), or to a case in a run with --run and --case")
    .option("-s, --status <name>", "Status, e.g. passed, failed, blocked, retest")
    .option("-m, --comment <text>", "Comment (Markdown)")
    .option("-f, --file <path>", "Read the comment from a file (- reads stdin)")
    .option("-df, --defects <keys>", "Defect keys, comma-separated (e.g. KAN-2,KAN-3)")
    .option("-e, --elapsed <time>", "Time spent, e.g. 1m 45s")
    .option("-b, --build <version>", "Build or version tested (--version is the CLI's own)")
    .option("-ru, --run <run>", "Run of the case, e.g. R3 (with --case, instead of a test id)")
    .option("-ca, --case <case>", "Case in that run, e.g. C12")
    .option("-a, --assign <user>", "Reassign the test: me, an email or a user id")
    .option("-sl, --steps <list>", "Step statuses by step number, e.g. 1:passed,2:failed (others Untested)")
    .option("-cb, --create-bug", "Create a Jira Bug first and add its key to --defects (needs jira-cli)")
    .option(
      "-at, --attach <file>",
      "Attach a file to the new result; repeat -at for more (up to 256 MB each)",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .action(async (rawTest: string | undefined, opts: AddOptions, cmd: Command) => {
      const target = parseTarget(rawTest, opts);
      const comment = await readOptionalText(opts.comment, opts.file, "comment");
      const steps = opts.steps === undefined ? undefined : parseStepList(opts.steps);
      // Checked before the result exists: results are append-only, so a retry would add a second one.
      const uploads = opts.attach.length > 0 ? await checkUploads(opts.attach) : [];
      const { config, mode } = bootstrap(cmd);
      const meta = provider().meta;
      // Statuses and the assignee before the write: a failed lookup after it would report an error for a saved result.
      const [statuses, assignee] = await Promise.all([
        meta.statuses(),
        provider().users.resolveOptional(opts.assign, config.email, "--assign"),
      ]);
      const input = await toResultInput(
        { ...opts, comment, version: opts.build, assignedToId: assignee?.id },
        meta,
        "result",
      );
      if (steps)
        input.custom_step_results = await toStepResults(steps, await caseSteps(target), meta, "--steps");
      const bug = opts.createBug
        ? await fileBug(
            config,
            await provider().results.openTest(target),
            bugStatus(statuses, input.status_id),
            comment,
          )
        : undefined;
      if (bug) input.defects = joinRefs([...splitList(input.defects), bug.key]);
      const added = await addResult(target, input).catch((err: unknown) => {
        // The bug exists now; say so, or a retry files a second one.
        if (!bug || !(err instanceof CliError)) throw err;
        throw err.withNote(
          `Jira bug ${bug.key} was already created (${bug.url}); retry with --defects ${bug.key}, not --create-bug.`,
          { bug, error: err.details },
        );
      });
      const ids = await attachTo(added.id, added.test_id, uploads);
      const view = {
        ...toResult(added, statuses),
        testId: added.test_id,
        bug: bug ? { key: bug.key, url: bug.url } : null,
        assignedTo: assigneeView(assignee),
        attachments: attached(uploads, ids),
        url: testUrl(config, added.test_id),
      };
      printResult(mode, view, () => {
        const filed = view.bug ? `\nCreated Jira bug ${view.bug.key}  ${view.bug.url}` : "";
        const assigned = view.assignedTo ? `\nAssigned to ${view.assignedTo.name}` : "";
        const files =
          view.attachments.length > 0 ? `\n${renderAttached(`#${view.id}`, view.attachments)}` : "";
        return `Added result #${view.id} to T${view.testId}${filed}${assigned}\n${renderResult(view)}${files}\n${view.url}`;
      });
    });
}

function parseTarget(rawTest: string | undefined, opts: AddOptions): ResultTarget {
  const byCase = opts.run !== undefined || opts.case !== undefined;
  if (rawTest !== undefined && byCase)
    throw new InputError("USAGE", "Give a test id or --run with --case, not both");
  if (rawTest !== undefined) return { kind: "test", testId: testId(rawTest) };
  if (opts.run === undefined || opts.case === undefined) {
    throw new InputError("USAGE", "Give a test id (T45), or both --run R3 and --case C12");
  }
  return { kind: "case", runId: runId(opts.run), caseId: caseId(opts.case) };
}

/** The separated steps of the case behind the target, to fill each step result's content. */
async function caseSteps(target: ResultTarget): Promise<Step[] | null | undefined> {
  const content =
    target.kind === "test"
      ? await provider().tests.get(target.testId)
      : await provider().cases.get(target.caseId);
  return content.custom_steps_separated;
}

function addResult(target: ResultTarget, input: ResultInput) {
  const results = provider().results;
  return target.kind === "test"
    ? results.addForTest(target.testId, input)
    : results.addForCase(target.runId, target.caseId, input);
}

/** Uploads --attach files to the saved result; a failure says so, or a retry adds a second result. */
async function attachTo(resultId: number, test: number, uploads: readonly Upload[]) {
  if (uploads.length === 0) return [];
  return provider()
    .attachments.addAll({ kind: "result", id: resultId }, uploads)
    .catch((err: unknown) => {
      if (!(err instanceof CliError)) throw err;
      throw err.withNote(
        `Result #${resultId} was saved; attach the files with test-cli attachment add T${test} -rs ${resultId}, not result add.`,
        { resultId, testId: test, error: err.details },
      );
    });
}

/** A bug is filed only for a failed or blocked result, so a passing run cannot open one by mistake. */
function bugStatus(statuses: readonly Status[], statusId: number | undefined): "failed" | "blocked" {
  const name = statuses.find((status) => status.id === statusId)?.name;
  if (name !== "failed" && name !== "blocked")
    throw new InputError("USAGE", "--create-bug needs -s failed or -s blocked.");
  return name;
}

/** A Jira Bug named after the test, with the comment and a link back to TestRail. */
async function fileBug(
  config: Config,
  test: Test,
  status: "failed" | "blocked",
  comment: string | undefined,
): Promise<JiraCreated> {
  const url = testUrl(config, test.id);
  const description = [comment, `TestRail test T${test.id}: ${url}`].filter(Boolean).join("\n\n");
  // Jira summaries hold 255 characters.
  return createJiraBug(clip(`T${test.id} ${status}: ${test.title}`, MAX_SUMMARY), description);
}
