import { notFound } from "../errors.js";
import { CliError, InputError } from "../../../core/errors.js";
import type { HttpClient } from "../http.js";
import { collectPages } from "../paging.js";
import { inBatches, type Collected } from "../../../core/paging.js";
import type { Result, Run, StepResult, Test } from "../types.js";
import type { CaseService } from "./case.service.js";
import type { RunService } from "./run.service.js";
import type { TestService } from "./test.service.js";

/** Fields of a new result; TestRail needs a status, a comment or an assignee (defects alone are refused). */
export interface ResultInput {
  status_id?: number;
  comment?: string;
  defects?: string;
  elapsed?: string;
  version?: string;
  /** Reassigns the test. */
  assignedto_id?: number;
  custom_step_results?: StepResult[];
}

/** Where a result goes: a test, or a case inside a run. */
export type ResultTarget = { kind: "test"; testId: number } | { kind: "case"; runId: number; caseId: number };

export interface RunResult {
  run: Run;
  result: Result;
}

/** A real case outside the run: "No (active) test found for the run/case combination." */
function notInRun(runId: number, caseId: number): (err: unknown) => never {
  return (err: unknown) => {
    if (err instanceof CliError && err.status === 400 && /no \(active\) test found/i.test(err.message)) {
      throw new InputError("CASE_NOT_IN_RUN", `Case C${caseId} is not in run R${runId}.`, err.message);
    }
    throw err;
  };
}

function skipNotInRun(err: unknown): undefined {
  if (err instanceof CliError && err.code === "CASE_NOT_IN_RUN") return undefined;
  throw err;
}

/** add_result(s) and get_results_for_case endpoints. Results are append-only: TestRail has no edit or delete for them. */
export class ResultService {
  constructor(
    private readonly http: HttpClient,
    private readonly tests: TestService,
    private readonly runs: RunService,
    private readonly cases: CaseService,
  ) {}

  addForTest(testId: number, input: ResultInput): Promise<Result> {
    return this.http.post<Result>(`add_result/${testId}`, input).catch(notFound.test(testId));
  }

  addForCase(runId: number, caseId: number, input: ResultInput): Promise<Result> {
    return this.http
      .post<Result>(`add_result_for_case/${runId}/${caseId}`, input)
      .catch(notFound.run(runId))
      .catch(notFound.case(caseId))
      .catch(notInRun(runId, caseId));
  }

  /** The case's results in one run, newest first. */
  forCase(runId: number, caseId: number, limit: number): Promise<Collected<Result>> {
    return collectPages<Result>(`get_results_for_case/${runId}/${caseId}`, "results", {}, limit, this.http)
      .catch(notFound.run(runId))
      .catch(notFound.case(caseId))
      .catch(notInRun(runId, caseId));
  }

  /**
   * The case's results across `runs` (newest run first), newest result first; runs without the case
   * are skipped. One get_results_for_case per run: get_tests then get_results would take two.
   * Every run is scanned (a few at a time): an old run can hold the newest result.
   */
  async history(runs: Run[], caseId: number, limit: number): Promise<Collected<RunResult>> {
    const pages = await inBatches(runs, (run) => this.forCase(run.id, caseId, limit).catch(skipNotInRun));
    const found = runs.flatMap((run, index) =>
      (pages[index]?.items ?? []).map((result) => ({ run, result })),
    );
    found.sort((left, right) => right.result.created_on - left.result.created_on);
    return {
      items: found.slice(0, limit),
      hasMore: pages.some((page) => page?.hasMore) || found.length > limit,
    };
  }

  /** Every result in the run, for all its tests, newest first as TestRail returns them. */
  forRun(runId: number): Promise<Collected<Result>> {
    return collectPages<Result>(
      `get_results_for_run/${runId}`,
      "results",
      {},
      Number.MAX_SAFE_INTEGER,
      this.http,
    ).catch(notFound.run(runId));
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
    if (target.kind === "test") {
      const test = await this.tests.get(target.testId);
      await this.runs.open(test.run_id);
      return test;
    }
    const [, found] = await Promise.all([
      this.runs.open(target.runId),
      this.tests.forCase(target.runId, target.caseId),
    ]);
    if (found) return found;
    await this.cases.get(target.caseId);
    throw new InputError("CASE_NOT_IN_RUN", `Case C${target.caseId} is not in run R${target.runId}.`);
  }
}
