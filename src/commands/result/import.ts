import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { z } from "zod";
import { caseId, runId } from "../../providers/testrail/ids.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { readText } from "../../core/input.js";
import { grid, printResult } from "../../core/output.js";
import { type MetaService } from "../../providers/testrail/services/meta.service.js";
import type { Step } from "../../providers/testrail/types.js";
import { type ResultInput } from "../../providers/testrail/services/result.service.js";
import type { User } from "../../providers/testrail/types.js";
import { toResult } from "../render.js";
import { toResultInput } from "./fields.js";
import { toStepResults, type StepSpec } from "./steps.js";

/** Most results one import sends; keeps a single request a reasonable size. */
const MAX_RESULTS = 1000;

const entrySchema = z.object({
  case: z.union([z.string(), z.number().int().positive()]),
  status: z.string().optional(),
  comment: z.string().optional(),
  defects: z.union([z.string(), z.array(z.string())]).optional(),
  elapsed: z.string().optional(),
  version: z.string().optional(),
  assign: z.union([z.string(), z.number().int().positive()]).optional(),
  steps: z
    .array(z.object({ step: z.number().int().positive(), status: z.string(), actual: z.string().optional() }))
    .min(1)
    .optional(),
});
const fileSchema = z.array(entrySchema).min(1).max(MAX_RESULTS);

interface ImportOptions {
  file: string;
}

export function registerImport(result: Command): void {
  result
    .command("import <run>")
    .description("Add many results to a run in one request from a JSON file")
    .requiredOption(
      "-f, --file <path>",
      'JSON array of {"case":"C12","status":"failed","comment","defects","elapsed","version","assign","steps"} (- reads stdin)',
    )
    .addHelpText(
      "after",
      '\nExample file:\n  [{"case": "C1", "status": "passed", "elapsed": "45s"},\n   {"case": "C2", "status": "failed", "comment": "500 page", "defects": "KAN-2"},\n   {"case": "C3", "status": "failed", "steps": [{"step": 2, "status": "failed", "actual": "500 page"}]}]',
    )
    .action(async (rawRun: string, opts: ImportOptions, cmd: Command) => {
      const run = runId(rawRun);
      const entries = parseFile(await readText(undefined, opts.file, "results file"));
      const { config, mode } = bootstrap(cmd);
      const meta = provider().meta;
      // Statuses and assignees before the write: a failed lookup after it would hide that the results were saved.
      const [statuses, stepsOf] = await Promise.all([
        meta.statuses(),
        entries.some((entry) => entry.steps) ? runSteps(run) : undefined,
      ]);
      const assignees = new Map<string, Promise<User>>();
      const users = provider().users;
      const results: (ResultInput & { case_id: number })[] = [];
      for (const [index, entry] of entries.entries()) {
        const where = `entry ${index + 1}`;
        const id = typeof entry.case === "number" ? entry.case : caseId(entry.case, where);
        const assign = entry.assign === undefined ? undefined : String(entry.assign).trim().toLowerCase();
        if (assign !== undefined && !assignees.has(assign)) {
          assignees.set(assign, users.resolve(assign, config.email, `${where}: assign`));
        }
        const assignee = assign === undefined ? undefined : await assignees.get(assign);
        const input = await toResultInput({ ...entry, assignedToId: assignee?.id }, meta, where);
        if (entry.steps && stepsOf)
          input.custom_step_results = await stepResults(entry.steps, stepsOf, id, run, meta, where);
        results.push({ case_id: id, ...input });
      }
      const added = await provider().results.addForCases(run, results);
      const rows = added.map((item, index) => ({
        id: item.id,
        testId: item.test_id,
        caseId: results[index]?.case_id ?? null,
        status: toResult(item, statuses).status,
      }));
      printResult(mode, { runId: run, added: rows }, () =>
        [
          `Added ${rows.length} results to R${run}`,
          grid(
            rows.map((row) => [
              `T${row.testId}`,
              row.caseId ? `C${row.caseId}` : "",
              row.status ?? "Comment",
            ]),
          ),
        ].join("\n"),
      );
    });
}

/** Each case's separated steps in the run, from its tests (one paged request). */
async function runSteps(run: number): Promise<Map<number, Step[] | null | undefined>> {
  const tests = await provider().tests.all(run);
  return new Map(tests.map((test) => [test.case_id, test.custom_steps_separated]));
}

function stepResults(
  specs: StepSpec[],
  stepsOf: Map<number, Step[] | null | undefined>,
  id: number,
  run: number,
  meta: MetaService,
  where: string,
) {
  if (!stepsOf.has(id))
    throw new InputError("CASE_NOT_IN_RUN", `${where}: case C${id} is not in run R${run}.`);
  return toStepResults(specs, stepsOf.get(id), meta, where);
}

function parseFile(text: string): z.infer<typeof fileSchema> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new InputError("USAGE", "The results file is not valid JSON", String(err));
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InputError(
      "USAGE",
      `The results file must be a JSON array of 1 to ${MAX_RESULTS} results`,
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "file"}: ${issue.message}`),
    );
  }
  return parsed.data;
}
