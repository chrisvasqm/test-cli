import { notFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages, type Collected } from "../core/paging.js";
import type { Result, Test } from "../core/testrail-types.js";

/** get_test(s) and get_results endpoints. A test is one case inside one run. */
export class TestService {
  constructor(private readonly http = HttpClient.get()) {}

  get(id: number): Promise<Test> {
    return this.http.get<Test>(`get_test/${id}`).catch(notFound.test(id));
  }

  /** Every test of the run, optionally only those with `statusIds`. */
  async all(runId: number, statusIds: number[] = []): Promise<Test[]> {
    return (await this.list(runId, statusIds, Number.MAX_SAFE_INTEGER)).items;
  }

  /** `assignedTo` filters here: get_tests has no assignee filter, so every page is read first. */
  async list(
    runId: number,
    statusIds: number[],
    limit: number,
    assignedTo?: number,
  ): Promise<Collected<Test>> {
    const status = statusIds.length > 0 ? statusIds.join(",") : undefined;
    const want = assignedTo === undefined ? limit : Number.MAX_SAFE_INTEGER;
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

  /** Newest first, as TestRail returns them. */
  results(testId: number, limit: number): Promise<Collected<Result>> {
    return collectPages<Result>(`get_results/${testId}`, "results", {}, limit, this.http).catch(
      notFound.test(testId),
    );
  }
}
