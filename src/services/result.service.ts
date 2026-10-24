import { notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import type { Result } from "../core/testrail-types.js";

/** Fields of a new result; TestRail needs at least one of status, comment or defects. */
export interface ResultInput {
  status_id?: number;
  comment?: string;
  defects?: string;
  elapsed?: string;
  version?: string;
}

/** add_result(s) endpoints. Results are append-only: TestRail has no edit or delete for them. */
export class ResultService {
  constructor(private readonly http = HttpClient.get()) {}

  addForTest(testId: number, input: ResultInput): Promise<Result> {
    return this.http
      .post<Result>(`add_result/${testId}`, input)
      .catch(notFoundAs("test_id", "TEST_NOT_FOUND", `Test T${testId} does not exist or you cannot see it.`));
  }

  addForCase(runId: number, caseId: number, input: ResultInput): Promise<Result> {
    return this.http
      .post<Result>(`add_result_for_case/${runId}/${caseId}`, input)
      .catch(notFoundAs("run_id", "RUN_NOT_FOUND", `Run R${runId} does not exist or you cannot see it.`))
      .catch(notFoundAs("case_id", "CASE_NOT_IN_RUN", `Case C${caseId} is not in run R${runId}.`));
  }

  /** One request for many cases; TestRail applies all or none. */
  addForCases(runId: number, results: (ResultInput & { case_id: number })[]): Promise<Result[]> {
    return this.http
      .post<Result[]>(`add_results_for_cases/${runId}`, { results })
      .catch(notFoundAs("run_id", "RUN_NOT_FOUND", `Run R${runId} does not exist or you cannot see it.`));
  }
}
