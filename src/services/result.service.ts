import { CliError, notFound } from "../core/errors.js";
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
    return this.http.post<Result>(`add_result/${testId}`, input).catch(notFound.test(testId));
  }

  addForCase(runId: number, caseId: number, input: ResultInput): Promise<Result> {
    return this.http
      .post<Result>(`add_result_for_case/${runId}/${caseId}`, input)
      .catch(notFound.run(runId))
      .catch(notFound.case(caseId))
      .catch((err: unknown) => {
        // A real case outside the run: "No (active) test found for the run/case combination."
        if (err instanceof CliError && err.status === 400 && /no \(active\) test found/i.test(err.message)) {
          throw new CliError("CASE_NOT_IN_RUN", `Case C${caseId} is not in run R${runId}.`, err.message);
        }
        throw err;
      });
  }

  /** One request for many cases; TestRail applies all or none. */
  addForCases(runId: number, results: (ResultInput & { case_id: number })[]): Promise<Result[]> {
    return this.http.post<Result[]>(`add_results_for_cases/${runId}`, { results }).catch(notFound.run(runId));
  }
}
