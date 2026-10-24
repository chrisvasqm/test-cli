/** suite_mode 1: one suite, 2: one suite plus baselines, 3: several suites. */
export const SUITE_MODE_SINGLE = 1;

export interface Project {
  id: number;
  name: string;
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
}

export interface Section {
  id: number;
  name: string;
  suite_id: number;
  parent_id: number | null;
  depth: number;
}

export interface Step {
  content: string | null;
  expected: string | null;
}

export interface Case {
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
  custom_preconds?: string | null;
  custom_steps?: string | null;
  custom_expected?: string | null;
  custom_steps_separated?: Step[] | null;
}

export interface Run {
  id: number;
  name: string;
  description: string | null;
  suite_id: number;
  milestone_id: number | null;
  plan_id: number | null;
  include_all: boolean;
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
  [customCount: `custom_status${number}_count`]: number;
}

export interface Test {
  id: number;
  case_id: number;
  run_id: number;
  status_id: number;
  title: string;
  type_id: number;
  priority_id: number;
  refs: string | null;
  estimate: string | null;
  custom_preconds?: string | null;
  custom_steps?: string | null;
  custom_expected?: string | null;
  custom_steps_separated?: Step[] | null;
}

export interface Result {
  id: number;
  test_id: number;
  /** null for a result that only adds a comment or reassigns. */
  status_id: number | null;
  comment: string | null;
  defects: string | null;
  elapsed: string | null;
  version: string | null;
  created_on: number;
  created_by: number;
}

export interface Status {
  id: number;
  name: string;
  label: string;
  is_system: boolean;
  is_untested: boolean;
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
