import { InputError } from "../../core/errors.js";
import type { Step, StepResult } from "../../providers/testrail/types.js";
import { splitList } from "../../core/text.js";
import type { MetaService } from "../../providers/testrail/services/meta.service.js";

/** One step's outcome as typed: its 1-based number in the case, a status name and what happened. */
export interface StepSpec {
  step: number;
  status: string;
  actual?: string | undefined;
}

/** "1:passed,2:failed" → step specs. */
export function parseStepList(raw: string): StepSpec[] {
  const specs = splitList(raw).map((part) => {
    const match = /^(\d+)\s*:\s*(.+)$/.exec(part);
    if (!match) {
      throw new InputError("STEP_INVALID", `"${part}" is not a step like 2:failed (step number:status)`);
    }
    return { step: Number(match[1]), status: match[2]!.trim() };
  });
  if (specs.length === 0)
    throw new InputError("STEP_INVALID", "--steps needs at least one step, e.g. 1:passed");
  return specs;
}

/**
 * TestRail's custom_step_results for a case's separated steps: every step in order, with the
 * case's content and expected text. Steps not given are Untested. `where` names the input in errors.
 */
export async function toStepResults(
  specs: StepSpec[],
  caseSteps: Step[] | null | undefined,
  meta: MetaService,
  where: string,
): Promise<StepResult[]> {
  const steps = caseSteps ?? [];
  if (steps.length === 0) {
    throw new InputError(
      "NO_STEPS",
      `${where}: the case has no separated steps (Steps template) to report on`,
    );
  }
  const untested = (await meta.statuses()).find((status) => status.is_untested);
  if (!untested) throw new InputError("NO_STEPS", `${where}: TestRail lists no Untested status for steps`);
  const given = new Map<number, StepSpec>();
  for (const spec of specs) {
    if (!Number.isSafeInteger(spec.step) || spec.step < 1 || spec.step > steps.length) {
      throw new InputError(
        "STEP_INVALID",
        `${where}: step ${spec.step} is not between 1 and ${steps.length}`,
      );
    }
    if (given.has(spec.step))
      throw new InputError("STEP_INVALID", `${where}: step ${spec.step} is given twice`);
    given.set(spec.step, spec);
  }
  const statusIds = new Map<number, number>();
  for (const spec of given.values()) statusIds.set(spec.step, (await meta.status(spec.status)).id);
  return steps.map((step, index) => ({
    content: step.content ?? "",
    expected: step.expected ?? "",
    actual: given.get(index + 1)?.actual ?? "",
    status_id: statusIds.get(index + 1) ?? untested.id,
  }));
}
