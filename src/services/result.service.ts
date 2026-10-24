import { CliError, InputError, notFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import type { Result, Test } from "../core/testrail-types.js";
import { CaseService } from "./case.service.js";
import { RunService } from "./run.service.js";
import { TestService } from "./test.service.js";

/** Fields of a new result; TestRail needs a status or a comment (defects alone are refused). */
export interface ResultInput {
  status_id?: number;
  comment?: string;
  defects?: string;
  elapsed?: string;
  version?: string;
}

/** Where a result goes: a test, or a case inside a run. */
export type ResultTarget = { kind: "test"; testId: number } | { kind: "case"; runId: number; caseId: number };

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

  /**
   * The test a result would go to, checked so TestRail will take it: open run, and the case in it.
   * For writes that cannot be undone (a Jira bug) and must not be followed by a refused result.
   */
  async openTest(target: ResultTarget): Promise<Test> {
    const tests = new TestService(this.http);
    if (target.kind === "test") {
      const test = await tests.get(target.testId);
      await this.assertOpen(test.run_id);
      return test;
    }
    await this.assertOpen(target.runId);
    const { items } = await tests.list(target.runId, [], Number.MAX_SAFE_INTEGER);
    const found = items.find((item) => item.case_id === target.caseId);
    if (found) return found;
    await new CaseService(this.http).get(target.caseId);
    throw new CliError("CASE_NOT_IN_RUN", `Case C${target.caseId} is not in run R${target.runId}.`);
  }

  private async assertOpen(runId: number): Promise<void> {
    if ((await new RunService(this.http).get(runId)).is_completed) {
      throw new InputError("RUN_CLOSED", `Run R${runId} is closed; TestRail takes no new results in it.`);
    }
  }
}
