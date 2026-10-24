/**
 * The inputs, filters and targets that commands hand to a provider's services (see provider.ts).
 * Records still use TestRail's shapes; neutral ones arrive with the second provider (Qase).
 */
import type { CaseContent, Plan, PlanEntry, PlanRun, Result, Run, StepResult } from "./testrail/types.js";

export interface CaseFilter {
  projectId: number;
  suiteId: number | undefined;
  sectionId: number | undefined;
  /** Only cases whose refs match this key (TestRail's own, loose, match). */
  refs?: string;
  /** Title text (TestRail's `filter`). */
  query?: string | undefined;
  priorityIds?: number[] | undefined;
  typeIds?: number[] | undefined;
  /** Unix seconds; only cases updated at or after it. */
  updatedAfter?: number | undefined;
  limit: number;
}

/** Writable case fields; the custom_* content fields depend on the case's template. */
export interface CaseInput extends CaseContent {
  title?: string;
  template_id?: number;
  type_id?: number;
  priority_id?: number;
  refs?: string;
  estimate?: string;
}

/** What a file can be attached to. A test has no attachments of its own; they go on its results. */
export type AttachTarget = { kind: "case" | "run" | "result"; id: number };

/** Whose attachments to list; a test's are those on its results. */
export type AttachmentsOf = { kind: "case" | "run" | "test"; id: number };

export interface MilestoneInput {
  name: string;
  description?: string;
  /** Unix seconds. */
  start_on?: number;
  /** Unix seconds. */
  due_on?: number;
  parent_id?: number;
  refs?: string;
}

/** update_milestone fields: any of add_milestone's, plus the started and completed flags. */
export interface MilestoneUpdate extends Partial<MilestoneInput> {
  is_started?: boolean;
  is_completed?: boolean;
}

/** Which cases a run gets and who it is assigned to. */
export interface PlanRunInput {
  /** true: every case in the suite; false: only case_ids. */
  include_all: boolean;
  case_ids?: number[];
  assignedto_id?: number;
  config_ids?: number[];
}

/** One suite's runs in a plan; `runs` has one item per configuration combination. */
export interface PlanEntryInput extends PlanRunInput {
  suite_id: number;
  /** TestRail names the entry after the suite when omitted. */
  name?: string;
  runs?: PlanRunInput[];
}

export interface PlanInput {
  name: string;
  description?: string;
  milestone_id?: number;
  entries?: PlanEntryInput[];
}

/** What a Jira key is linked to: a case's or run's refs, or a test's result defects. */
export type LinkTarget = RefsTarget | { kind: "test"; id: number };
/** Targets whose links are a refs field, so they can also be removed. */
export type RefsTarget = { kind: "case" | "run"; id: number };

export interface SuiteInput {
  name: string;
  description?: string;
}

/** Fields of a new result; TestRail needs a status, a comment or an assignee (defects alone are refused). */
export interface ResultInput {
  status_id?: number;
  comment?: string;
  defects?: string;
  elapsed?: string;
  version?: string;
  /** Reassigns the test. */
  assignedto_id?: number;
  custom_step_results?: StepResult[];
}

/** Where a result goes: a test, or a case inside a run. */
export type ResultTarget = { kind: "test"; testId: number } | { kind: "case"; runId: number; caseId: number };

export interface RunResult {
  run: Run;
  result: Result;
}

/** A run with the plan it belongs to (null outside plans). */
export interface OpenRun {
  run: Run | PlanRun;
  plan: Plan | null;
}

/** Which runs to list; a field left out matches every run. */
export interface RunFilter {
  /** true: only closed runs; false: only open ones. */
  completed?: boolean | undefined;
  milestoneId?: number | undefined;
  suiteId?: number | undefined;
}

/** An open run and, inside a test plan, its plan entry, which decides how TestRail changes it. */
export interface EditableRun {
  run: Run;
  entry: PlanEntry | null;
}

export interface RunInput {
  name: string;
  suite_id?: number;
  description?: string;
  milestone_id?: number;
  refs?: string;
  assignedto_id?: number;
  /** true: every case in the suite; false: only case_ids. */
  include_all: boolean;
  case_ids?: number[];
}

export type RunChange = Partial<Omit<RunInput, "suite_id">>;

export interface SectionInput {
  name: string;
  description?: string;
  /** Required when the project has more than one suite. */
  suite_id?: number;
  /** Left out: a top-level section. */
  parent_id?: number;
}

export interface SectionMove {
  /** null: the top level. */
  parent_id?: number | null;
  /** The sibling to put it after; null: the first place. */
  after_id?: number | null;
}
