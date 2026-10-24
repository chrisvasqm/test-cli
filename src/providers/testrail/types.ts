/** suite_mode 1: one suite, 2: one suite plus baselines, 3: several suites. */
export const SUITE_MODE_SINGLE = 1;

export interface Project {
  id: number;
  name: string;
  /** HTML; TestRail shows it on the overview page only when show_announcement is true. */
  announcement: string | null;
  show_announcement: boolean;
  is_completed: boolean;
  suite_mode: number;
  url: string;
}

export interface Suite {
  id: number;
  name: string;
  description: string | null;
  project_id: number;
  is_completed?: boolean;
  url: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
}

export interface Section {
  id: number;
  name: string;
  description: string | null;
  suite_id: number;
  parent_id: number | null;
  depth: number;
}

export interface Step {
  content: string | null;
  expected: string | null;
}

/** A step as the CLI shows and sends it. */
export interface StepInput {
  content: string;
  expected: string;
}

/** Fields shared by cases and tests that describe how to test; which ones are used depends on the template. */
export interface CaseContent {
  custom_preconds?: string | null | undefined;
  custom_steps?: string | null | undefined;
  custom_expected?: string | null | undefined;
  custom_steps_separated?: Step[] | null | undefined;
}

export interface Case extends CaseContent {
  id: number;
  title: string;
  section_id: number;
  suite_id: number;
  template_id: number;
  type_id: number;
  priority_id: number;
  milestone_id: number | null;
  refs: string | null;
  estimate: string | null;
  created_on: number;
  updated_on: number;
}

export interface Run {
  id: number;
  name: string;
  description: string | null;
  suite_id: number;
  milestone_id: number | null;
  plan_id: number | null;
  include_all: boolean;
  assignedto_id: number | null;
  is_completed: boolean;
  completed_on: number | null;
  refs: string | null;
  passed_count: number;
  blocked_count: number;
  untested_count: number;
  retest_count: number;
  failed_count: number;
  created_on: number;
  url: string;
}

/** Tests per system status; custom statuses add custom_status1..7_count. */
export interface StatusCounts {
  passed_count: number;
  blocked_count: number;
  untested_count: number;
  retest_count: number;
  failed_count: number;
}

/** A run inside a test plan: one per configuration combination of its entry. */
export interface PlanRun extends Run {
  entry_id: string;
  /** "Chrome, Windows"; null without configurations. */
  config: string | null;
  config_ids: number[];
}

/** A group of runs for one suite in a plan; its id is a GUID, not a number. */
export interface PlanEntry {
  id: string;
  suite_id: number;
  name: string;
  runs: PlanRun[];
}

/** Plans and runs share one id sequence; TestRail shows both as R ids. */
export interface Plan extends StatusCounts {
  id: number;
  name: string;
  description: string | null;
  milestone_id: number | null;
  assignedto_id: number | null;
  is_completed: boolean;
  completed_on: number | null;
  created_on: number;
  url: string;
  /** Only get_plan (and add_plan, close_plan) return the entries. */
  entries?: PlanEntry[];
}

export interface Milestone {
  id: number;
  name: string;
  description: string | null;
  project_id: number;
  parent_id: number | null;
  refs: string | null;
  start_on: number | null;
  started_on: number | null;
  is_started: boolean;
  due_on: number | null;
  is_completed: boolean;
  completed_on: number | null;
  url: string;
  /** Sub-milestones; get_milestones and get_milestone nest them under their parent. */
  milestones?: Milestone[];
}

export interface Test extends CaseContent {
  id: number;
  case_id: number;
  run_id: number;
  status_id: number;
  assignedto_id: number | null;
  title: string;
  type_id: number;
  priority_id: number;
  refs: string | null;
  estimate: string | null;
}

/** One step of a Steps-template result: the case's step, what happened and its status. */
export interface StepResult {
  content: string;
  expected: string;
  actual: string;
  status_id: number;
}

export interface Result {
  id: number;
  test_id: number;
  /** null for a result that only adds a comment or reassigns. */
  status_id: number | null;
  comment: string | null;
  defects: string | null;
  assignedto_id: number | null;
  elapsed: string | null;
  version: string | null;
  created_on: number;
  created_by: number;
  /** Per-step statuses; only on cases that use the Steps template. */
  custom_step_results?: StepResult[] | null;
}

/** Legacy servers use number ids; TestRail Cloud 7.1+ uses UUID strings and adds filename and entity fields. */
export interface Attachment {
  id: number | string;
  name: string;
  size: number;
  created_on: number;
  user_id: number;
}

export interface Status {
  id: number;
  name: string;
  label: string;
  is_system: boolean;
  is_untested: boolean;
  /** Done (Passed, Blocked, Failed); Untested and Retest are not. Older servers may leave it out. */
  is_final?: boolean;
}

export interface Named {
  id: number;
  name: string;
}

export interface Template {
  id: number;
  name: string;
  /** Stable key, e.g. "templates_test_case_steps"; the name can be renamed. */
  i18n_custom_id?: string | null;
  is_default: boolean;
}

/** One option of a configuration group, e.g. "Chrome" in "Browsers". */
export interface Config {
  id: number;
  name: string;
  group_id: number;
}

export interface ConfigGroup {
  id: number;
  name: string;
  project_id: number;
  configs: Config[];
}

/** A report template with "On-demand via the API" on; get_reports lists only those. */
export interface Report {
  id: number;
  name: string;
  description: string | null;
}

/** What run_report returns: links to the report TestRail just made. */
export interface ReportRun {
  report_url: string;
  report_html: string;
  report_pdf: string;
}
