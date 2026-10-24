import { notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages, type Collected } from "../core/paging.js";
import type { Result, Test } from "../core/testrail-types.js";

/** get_test(s) and get_results endpoints. A test is one case inside one run. */
export class TestService {
  constructor(private readonly http = HttpClient.get()) {}

  get(id: number): Promise<Test> {
    return this.http
      .get<Test>(`get_test/${id}`)
      .catch(notFoundAs("test_id", "TEST_NOT_FOUND", `Test T${id} does not exist or you cannot see it.`));
  }

  list(runId: number, statusIds: number[], limit: number): Promise<Collected<Test>> {
    const status = statusIds.length > 0 ? statusIds.join(",") : undefined;
    return collectPages<Test>(`get_tests/${runId}`, "tests", { status_id: status }, limit, this.http).catch(
      notFoundAs("run_id", "RUN_NOT_FOUND", `Run R${runId} does not exist or you cannot see it.`),
    );
  }

  /** Newest first, as TestRail returns them. */
  results(testId: number, limit: number): Promise<Collected<Result>> {
    return collectPages<Result>(`get_results/${testId}`, "results", {}, limit, this.http);
  }
}
