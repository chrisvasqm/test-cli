import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { caseIds, milestoneId, runId } from "../../providers/testrail/ids.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { InputError } from "../../core/errors.js";
import { readOptionalText } from "../../core/input.js";
import { printResult } from "../../core/output.js";
import { joinRefs, splitList, uniqueRefs } from "../../core/text.js";
import type { RunInput } from "../../providers/testrail/services/run.service.js";
import { assigneeView } from "../render.js";

interface EditOptions {
  name?: string;
  description?: string;
  file?: string;
  refs?: string;
  milestone?: string;
  assign?: string;
  cases?: string;
  add?: string;
  remove?: string;
  yes?: boolean;
}

/** The case selection asked for: exactly these cases, or the run's cases plus and minus some. */
interface CaseChange {
  exact?: number[];
  add: number[];
  remove: number[];
}

export function registerEdit(run: Command): void {
  run
    .command("edit <run>")
    .description("Change an open run's fields or cases, e.g. R3; fields left out stay as they are")
    .option("-na, --name <name>", "New name")
    .option("-d, --description <text>", "New description (Markdown)")
    .option("-f, --file <path>", "Read the description from a file (- reads stdin)")
    .option("-r, --refs <keys>", "Replace the references, comma-separated (e.g. KAN-1)")
    .option("-ml, --milestone <id>", "Milestone id, e.g. M3")
    .option("-a, --assign <user>", "Assign the run: me, an email or a user id")
    .option("-ca, --cases <ids>", "Run exactly these cases, comma-separated (e.g. C1,C2)")
    .option("-i, --add <ids>", "Add these cases to the run (e.g. C4,C5)")
    .option("-x, --remove <ids>", "Remove these cases, with their tests and results")
    .option("-y, --yes", "Remove cases without asking")
    .action(async (rawId: string, opts: EditOptions, cmd: Command) => {
      const id = runId(rawId);
      const change = caseChange(opts);
      const milestone = opts.milestone === undefined ? undefined : milestoneId(opts.milestone);
      const description = await readOptionalText(opts.description, opts.file, "description");
      const input: Partial<RunInput> = {};
      if (opts.name !== undefined) input.name = opts.name;
      if (description !== undefined) input.description = description;
      if (opts.refs !== undefined) input.refs = joinRefs(uniqueRefs(splitList(opts.refs)));
      if (milestone !== undefined) input.milestone_id = milestone;
      if (Object.keys(input).length === 0 && opts.assign === undefined && change === undefined) {
        throw new InputError("USAGE", "Give at least one field to change, e.g. --name or --add C4");
      }
      const { config, mode } = bootstrap(cmd);
      const { runs } = provider();
      const target = await runs.editable(id);
      const found = target.run;
      // Before resolving users or asking about removals.
      runs.assertChangeable(target, input);
      const [assignee, current] = await Promise.all([
        provider().users.resolveOptional(opts.assign, config.email, "--assign"),
        change === undefined ? undefined : runCases(id),
      ]);
      if (assignee) input.assignedto_id = assignee.id;
      const cases = current === undefined || change === undefined ? undefined : applyChange(current, change);
      if (cases) {
        if (cases.removed.length > 0 && !opts.yes) {
          await confirm(
            `Remove ${cases.removed.map((caseNo) => `C${caseNo}`).join(", ")} from R${id} "${found.name}" with their tests and results? This cannot be undone.`,
          );
        }
        input.include_all = false;
        input.case_ids = cases.ids;
      }
      if (Object.keys(input).length === 0) {
        throw new InputError("USAGE", "The run already has exactly those cases; nothing to change");
      }
      const updated = await runs.update(target, input);
      const view = {
        id: updated.id,
        name: updated.name,
        changed: Object.keys(input).filter((field) => field !== "include_all"),
        added: cases?.added ?? [],
        removed: cases?.removed ?? [],
        assignedTo: assigneeView(assignee),
        url: updated.url,
      };
      printResult(mode, view, () => {
        const lines = [`Updated R${view.id}  ${view.name}`];
        if (view.added.length > 0) lines.push(`Added ${view.added.map((caseNo) => `C${caseNo}`).join(", ")}`);
        if (view.removed.length > 0) {
          lines.push(`Removed ${view.removed.map((caseNo) => `C${caseNo}`).join(", ")}`);
        }
        if (view.assignedTo) lines.push(`Assigned to ${view.assignedTo.name}`);
        lines.push(view.url);
        return lines.join("\n");
      });
    });
}

function caseChange(opts: EditOptions): CaseChange | undefined {
  if (opts.cases !== undefined && (opts.add !== undefined || opts.remove !== undefined)) {
    throw new InputError("USAGE", "Give --cases alone, or --add and --remove, not both");
  }
  if (opts.cases !== undefined) return { exact: caseIds(opts.cases), add: [], remove: [] };
  if (opts.add === undefined && opts.remove === undefined) return undefined;
  const add = opts.add === undefined ? [] : caseIds(opts.add, "--add");
  const remove = opts.remove === undefined ? [] : caseIds(opts.remove, "--remove");
  const both = add.filter((caseNo) => remove.includes(caseNo));
  if (both.length > 0) {
    throw new InputError(
      "USAGE",
      `Cannot both add and remove ${both.map((caseNo) => `C${caseNo}`).join(", ")}`,
    );
  }
  return { add, remove };
}

/** Case ids of the run's tests: update_run takes the whole list, so add and remove start from it. */
async function runCases(id: number): Promise<number[]> {
  return (await provider().tests.all(id)).map((test) => test.case_id);
}

/** The new case list and what it adds and removes; undefined when it matches the run's cases. */
function applyChange(
  current: number[],
  change: CaseChange,
): { ids: number[]; added: number[]; removed: number[] } | undefined {
  const want = change.exact ?? [
    ...current.filter((caseNo) => !change.remove.includes(caseNo)),
    ...change.add,
  ];
  const ids = [...new Set(want)];
  const added = ids.filter((caseNo) => !current.includes(caseNo));
  const removed = current.filter((caseNo) => !ids.includes(caseNo));
  if (added.length === 0 && removed.length === 0) return undefined;
  if (ids.length === 0) throw new InputError("USAGE", "A run needs at least one case; remove fewer");
  return { ids, added, removed };
}
