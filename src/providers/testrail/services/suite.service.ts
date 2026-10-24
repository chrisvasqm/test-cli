import { notFound } from "../errors.js";
import type { HttpClient } from "../http.js";
import type { Suite } from "../types.js";
import type { SuiteInput } from "../../types.js";
import type { Suites } from "../../provider.js";

/** get_suite, add_suite, update_suite and delete_suite endpoints. get_suites is ProjectService.suites. */
export class SuiteService implements Suites {
  constructor(private readonly http: HttpClient) {}

  get(id: number): Promise<Suite> {
    return this.http.get<Suite>(`get_suite/${id}`).catch(notFound.suite(id));
  }

  /** Single-suite projects refuse a second suite; TestRail's message comes back as TESTRAIL_ERROR. */
  add(projectId: number, input: SuiteInput): Promise<Suite> {
    return this.http.post<Suite>(`add_suite/${projectId}`, input).catch(notFound.project(projectId));
  }

  /** Only the fields given change. */
  update(id: number, input: Partial<SuiteInput>): Promise<Suite> {
    return this.http.post<Suite>(`update_suite/${id}`, input).catch(notFound.suite(id));
  }

  /** Deletes the suite with its sections, cases and their tests. Never with `soft=1`: on Cloud it deletes too. */
  async remove(id: number): Promise<void> {
    await this.http.post<undefined>(`delete_suite/${id}`).catch(notFound.suite(id));
  }
}
