import { notFound } from "../errors.js";
import { HttpClient } from "../http.js";
import { collectPages, findInPages } from "../paging.js";
import { ALL, inBatches, type Collected } from "../../../core/paging.js";
import type { Result, Test } from "../types.js";

/** get_test(s) and get_results endpoints. A test is one case inside one run. */
export class TestService {
  constructor(private readonly http = HttpClient.get()) {}

  get(id: number): Promise<Test> {
    return this.http.get<Test>(`get_test/${id}`).catch(notFound.test(id));
  }

  /** Every test of the run, optionally only those with `statusIds`. */
  async all(runId: number, statusIds: number[] = []): Promise<Test[]> {
    return (await this.list(runId, statusIds, ALL)).items;
  }

  /**
   * The run's test of the case, or undefined when the case is not in the run. get_tests has no
   * case filter, so pages are read until the case turns up.
   */
  forCase(runId: number, caseId: number): Promise<Test | undefined> {
    return findInPages<Test>(
      `get_tests/${runId}`,
      "tests",
      {},
      (item) => item.case_id === caseId,
      this.http,
    ).catch(notFound.run(runId));
  }

  /** `assignedTo` filters here: get_tests has no assignee filter, so every page is read first. */
  async list(
    runId: number,
    statusIds: number[],
    limit: number,
    assignedTo?: number,
  ): Promise<Collected<Test>> {
    const status = statusIds.length > 0 ? statusIds.join(",") : undefined;
    const want = assignedTo === undefined ? limit : ALL;
    const page = await collectPages<Test>(
      `get_tests/${runId}`,
      "tests",
      { status_id: status },
      want,
      this.http,
    ).catch(notFound.run(runId));
    if (assignedTo === undefined) return page;
    const items = page.items.filter((item) => item.assignedto_id === assignedTo);
    return { items: items.slice(0, limit), hasMore: items.length > limit };
  }

  /** The tests assigned to `assignedTo` with `statusIds` in each of `runIds`, a few runs at a time, in the order of `runIds`. */
  async assigned(runIds: readonly number[], statusIds: number[], assignedTo: number): Promise<Test[]> {
    const perRun = await inBatches(
      runIds,
      async (id) => (await this.list(id, statusIds, ALL, assignedTo)).items,
    );
    return perRun.flat();
  }

  /** Newest first, as TestRail returns them. */
  results(testId: number, limit: number): Promise<Collected<Result>> {
    return collectPages<Result>(`get_results/${testId}`, "results", {}, limit, this.http).catch(
      notFound.test(testId),
    );
  }
}
