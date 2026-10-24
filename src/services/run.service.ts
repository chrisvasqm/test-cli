import { notFound, notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages, type Collected } from "../core/paging.js";
import type { Run } from "../core/testrail-types.js";

export interface RunInput {
  name: string;
  suite_id?: number;
  description?: string;
  milestone_id?: number;
  refs?: string;
  /** true: every case in the suite; false: only case_ids. */
  include_all: boolean;
  case_ids?: number[];
}

/** get_run(s), add_run, update_run and close_run endpoints. Runs inside test plans are listed by get_plans, not here. */
export class RunService {
  constructor(private readonly http = HttpClient.get()) {}

  get(id: number): Promise<Run> {
    return this.http.get<Run>(`get_run/${id}`).catch(notFound.run(id));
  }

  list(projectId: number, completed: boolean, limit: number): Promise<Collected<Run>> {
    return collectPages<Run>(`get_runs/${projectId}`, "runs", { is_completed: completed }, limit, this.http);
  }

  add(projectId: number, input: RunInput): Promise<Run> {
    // TestRail: "Field :case_ids contains unrecognized case IDs." (deleted, or in another suite).
    return this.http
      .post<Run>(`add_run/${projectId}`, input)
      .catch(
        notFoundAs("case_ids", "CASE_NOT_FOUND", "Some --cases ids are not cases in this project and suite."),
      );
  }

  /** Only the fields given change. TestRail refuses changes to a closed run. */
  update(id: number, input: Partial<Pick<RunInput, "name" | "description" | "refs">>): Promise<Run> {
    return this.http.post<Run>(`update_run/${id}`, input).catch(notFound.run(id));
  }

  /** Closing archives the run: TestRail cannot reopen it, and its results can no longer change. */
  close(id: number): Promise<Run> {
    return this.http.post<Run>(`close_run/${id}`).catch(notFound.run(id));
  }
}
