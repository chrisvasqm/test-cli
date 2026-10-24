import { InputError, notFound, notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages, type Collected } from "../core/paging.js";
import type { Run } from "../core/testrail-types.js";
import { sameKey, splitList } from "../core/text.js";

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

  /** Every run, open or closed, whose refs include `key` (exactly, ignoring case; TestRail's refs_filter is looser). */
  async withRef(projectId: number, key: string): Promise<Run[]> {
    const { items } = await collectPages<Run>(
      `get_runs/${projectId}`,
      "runs",
      { refs_filter: key },
      Number.MAX_SAFE_INTEGER,
      this.http,
    );
    return items.filter((item) => splitList(item.refs).some((ref) => sameKey(ref, key)));
  }

  add(projectId: number, input: RunInput): Promise<Run> {
    // TestRail: "Field :case_ids contains unrecognized case IDs." (deleted, or in another suite).
    return this.http
      .post<Run>(`add_run/${projectId}`, input)
      .catch(
        notFoundAs("case_ids", "CASE_NOT_FOUND", "Some --cases ids are not cases in this project and suite."),
      );
  }

  /** The run, which must be open: TestRail refuses changes and new results in a closed run. `known` skips the request. */
  async open(id: number, known?: Run): Promise<Run> {
    const run = known ?? (await this.get(id));
    if (run.is_completed) {
      throw new InputError("RUN_CLOSED", `Run R${id} is closed; TestRail takes no changes or results in it.`);
    }
    return run;
  }

  /** Only the fields given change. TestRail refuses changes to a closed run. */
  update(id: number, input: Partial<Pick<RunInput, "name" | "description" | "refs">>): Promise<Run> {
    return this.http.post<Run>(`update_run/${id}`, input).catch(notFound.run(id));
  }

  /** Closing archives the run: TestRail cannot reopen it, and its results can no longer change. */
  close(id: number): Promise<Run> {
    return this.http.post<Run>(`close_run/${id}`).catch(notFound.run(id));
  }

  /** Deletes the run with its tests and results. Never with `soft=1`: on Cloud it deletes too. */
  async remove(id: number): Promise<void> {
    await this.http.post<undefined>(`delete_run/${id}`).catch(notFound.run(id));
  }
}
