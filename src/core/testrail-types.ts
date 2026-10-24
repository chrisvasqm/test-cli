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
