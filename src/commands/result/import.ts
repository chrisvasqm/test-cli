import type { Command } from "commander";
import { z } from "zod";
import { caseId, runId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { readText } from "../../core/input.js";
import { grid, printResult } from "../../core/output.js";
import { MetaService } from "../../services/meta.service.js";
import { ResultService, type ResultInput } from "../../services/result.service.js";
import { toResult } from "../render.js";
import { toResultInput } from "./fields.js";

/** Most results one import sends; keeps a single request a reasonable size. */
const MAX_RESULTS = 1000;

const entrySchema = z.object({
  case: z.union([z.string(), z.number().int().positive()]),
  status: z.string().optional(),
  comment: z.string().optional(),
  defects: z.union([z.string(), z.array(z.string())]).optional(),
  elapsed: z.string().optional(),
  version: z.string().optional(),
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
      "--file <path>",
      'JSON array of {"case":"C12","status":"failed","comment","defects","elapsed","version"} (- reads stdin)',
    )
    .addHelpText(
      "after",
      '\nExample file:\n  [{"case": "C1", "status": "passed", "elapsed": "45s"},\n   {"case": "C2", "status": "failed", "comment": "500 page", "defects": "KAN-2"}]',
    )
    .action(async (rawRun: string, opts: ImportOptions, cmd: Command) => {
      const run = runId(rawRun);
      const entries = parseFile(await readText(undefined, opts.file, "results file"));
      const { mode } = bootstrap(cmd);
      const meta = new MetaService();
      // Statuses before the write: a failed lookup after it would hide that the results were saved.
      const statuses = await meta.statuses();
      const results: (ResultInput & { case_id: number })[] = [];
      for (const [index, entry] of entries.entries()) {
        const where = `entry ${index + 1}`;
        const id = typeof entry.case === "number" ? entry.case : caseId(entry.case, where);
        results.push({ case_id: id, ...(await toResultInput(entry, meta, where)) });
      }
      const added = await new ResultService().addForCases(run, results);
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
