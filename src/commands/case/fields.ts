import type { Command } from "commander";
import { InputError } from "../../core/errors.js";
import { joinRefs } from "../../core/text.js";
import type { StepInput } from "../../providers/testrail/types.js";
import type { CaseInput } from "../../providers/testrail/services/case.service.js";
import { idByName } from "../../providers/testrail/lookup.js";
import { type MetaService } from "../../providers/testrail/services/meta.service.js";

/** Stable key of the built-in "Test Case (Steps)" template; its name can be renamed. */
const STEPS_TEMPLATE = "templates_test_case_steps";
/** Separates a step's action from its expected result in --step. */
const STEP_SPLIT = "::";

export interface CaseFieldOptions {
  title?: string;
  type?: string;
  priority?: string;
  refs?: string;
  estimate?: string;
  preconds?: string;
  steps?: string;
  expected?: string;
  step?: string[];
}

const collect = (value: string, previous: string[] = []): string[] => [...previous, value];

/** Field flags shared by case create and case edit. */
export function addCaseFieldOptions(cmd: Command): Command {
  return cmd
    .option("-ty, --type <name>", "Case type, e.g. Functional, Regression")
    .option("-p, --priority <name>", "Priority, e.g. Low, Medium, High, Critical")
    .option("-r, --refs <keys>", "References, comma-separated (e.g. KAN-1); replaces existing refs")
    .option("-es, --estimate <time>", "Estimate, e.g. 30s, 5m, 1h")
    .option("-pc, --preconds <text>", "Preconditions (Markdown)")
    .option("-sp, --steps <text>", "Steps as one text (Test Case (Text) template)")
    .option("-ex, --expected <text>", "Expected result (Test Case (Text) template)")
    .option(
      "-sa, --step <action::expected>",
      `One step; repeat for each (switches the case to the Steps template). Split action and expected with "${STEP_SPLIT}"`,
      collect,
    );
}

/**
 * Builds TestRail's case body from the given flags; flags left out stay out. `changed` names the
 * fields the user set (template_id, implied by --step, is not one of them).
 */
export async function toCaseInput(
  opts: CaseFieldOptions,
  meta: MetaService,
  projectId: number,
): Promise<{ input: CaseInput; changed: string[] }> {
  if (opts.step !== undefined && (opts.steps !== undefined || opts.expected !== undefined)) {
    throw new InputError("USAGE", "Use --step for separate steps, or --steps/--expected for text; not both");
  }
  // Start every lookup the flags need at once: one round trip instead of up to three.
  const [types, priorities, templateId] = await Promise.all([
    opts.type === undefined ? undefined : meta.caseTypes(),
    opts.priority === undefined ? undefined : meta.priorities(),
    opts.step === undefined ? undefined : stepsTemplate(meta, projectId),
  ]);
  const input: CaseInput = {};
  if (opts.title !== undefined) {
    if (!opts.title.trim()) throw new InputError("USAGE", "--title cannot be empty");
    input.title = opts.title.trim();
  }
  if (types && opts.type !== undefined)
    input.type_id = idByName(types, opts.type, "UNKNOWN_TYPE", "case type");
  if (priorities && opts.priority !== undefined) {
    input.priority_id = idByName(priorities, opts.priority, "UNKNOWN_PRIORITY", "priority");
  }
  if (opts.refs !== undefined) input.refs = joinRefs(opts.refs);
  if (opts.estimate !== undefined) input.estimate = opts.estimate.trim();
  if (opts.preconds !== undefined) input.custom_preconds = opts.preconds;
  if (opts.steps !== undefined) input.custom_steps = opts.steps;
  if (opts.expected !== undefined) input.custom_expected = opts.expected;
  const changed = Object.keys(input);
  if (opts.step !== undefined && templateId !== undefined) {
    input.custom_steps_separated = opts.step.map(parseStep);
    input.template_id = templateId;
    changed.push("custom_steps_separated");
  }
  return { input, changed };
}

function parseStep(raw: string): StepInput {
  const [content = "", ...rest] = raw.split(STEP_SPLIT);
  if (!content.trim()) throw new InputError("USAGE", `--step "${raw}" has no action before "${STEP_SPLIT}"`);
  return { content: content.trim(), expected: rest.join(STEP_SPLIT).trim() };
}

async function stepsTemplate(meta: MetaService, projectId: number): Promise<number> {
  const templates = await meta.templates(projectId);
  const found =
    templates.find((item) => item.i18n_custom_id === STEPS_TEMPLATE) ??
    templates.find((item) => item.name === "Test Case (Steps)");
  if (!found) {
    throw new InputError(
      "NO_STEPS_TEMPLATE",
      "This project has no Test Case (Steps) template; use --steps and --expected instead.",
      templates.map((item) => item.name),
    );
  }
  return found.id;
}
