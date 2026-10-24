import { notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages, type Collected } from "../core/paging.js";
import type { Run } from "../core/testrail-types.js";

/** get_run(s) endpoints. Runs inside test plans are listed by get_plans, not here. */
export class RunService {
  constructor(private readonly http = HttpClient.get()) {}

  get(id: number): Promise<Run> {
    return this.http
      .get<Run>(`get_run/${id}`)
      .catch(notFoundAs("run_id", "RUN_NOT_FOUND", `Run R${id} does not exist or you cannot see it.`));
  }

  list(projectId: number, completed: boolean, limit: number): Promise<Collected<Run>> {
    return collectPages<Run>(`get_runs/${projectId}`, "runs", { is_completed: completed }, limit, this.http);
  }
}
