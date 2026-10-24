import { notFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages, inBatches, type Collected } from "../core/paging.js";
import { hasRef } from "../core/text.js";
import type { Case, CaseContent } from "../core/testrail-types.js";

export interface CaseFilter {
  projectId: number;
  suiteId: number | undefined;
  sectionId: number | undefined;
  /** Only cases whose refs match this key (TestRail's own, loose, match). */
  refs?: string;
  /** Title text (TestRail's `filter`). */
  query?: string | undefined;
  priorityIds?: number[] | undefined;
  typeIds?: number[] | undefined;
  /** Unix seconds; only cases updated at or after it. */
  updatedAfter?: number | undefined;
  limit: number;
}

/** Writable case fields; the custom_* content fields depend on the case's template. */
export interface CaseInput extends CaseContent {
  title?: string;
  template_id?: number;
  type_id?: number;
  priority_id?: number;
  refs?: string;
  estimate?: string;
}

/**
 * get/add/update/delete_case, get_cases, update_cases, and copy_/move_cases_to_section endpoints.
 * The bulk endpoints answer an unknown case with one 400 for the whole list, so callers check each
 * case with get first to name the missing one.
 */
export class CaseService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Every case, a few at a time; the first unknown one fails with CASE_NOT_FOUND. */
  getMany(ids: number[]): Promise<Case[]> {
    return inBatches(ids, (id) => this.get(id));
  }

  get(id: number): Promise<Case> {
    return this.http.get<Case>(`get_case/${id}`).catch(notFound.case(id));
  }

  list(filter: CaseFilter): Promise<Collected<Case>> {
    const page = collectPages<Case>(
      `get_cases/${filter.projectId}`,
      "cases",
      {
        suite_id: filter.suiteId,
        section_id: filter.sectionId,
        refs: filter.refs,
        filter: filter.query,
        priority_id: filter.priorityIds?.join(","),
        type_id: filter.typeIds?.join(","),
        updated_after: filter.updatedAfter,
      },
      filter.limit,
      this.http,
    );
    // Only a filtered list can miss its section; any other 404 stays NOT_FOUND.
    return filter.sectionId === undefined ? page : page.catch(notFound.section(filter.sectionId));
  }

  /** Every case whose refs include `key` (exactly, ignoring case; TestRail's refs filter is looser). */
  async withRef(filter: Omit<CaseFilter, "refs" | "limit">, key: string): Promise<Case[]> {
    const { items } = await this.list({ ...filter, refs: key, limit: Number.MAX_SAFE_INTEGER });
    return items.filter((item) => hasRef(item.refs, key));
  }

  /** Ids of every case linked to `key`. */
  async linkedTo(projectId: number, suiteId: number | undefined, key: string): Promise<number[]> {
    const cases = await this.withRef({ projectId, suiteId, sectionId: undefined }, key);
    return cases.map((item) => item.id);
  }

  add(sectionId: number, input: CaseInput & { title: string }): Promise<Case> {
    return this.http.post<Case>(`add_case/${sectionId}`, input).catch(notFound.section(sectionId));
  }

  /** Only the fields given change. */
  update(id: number, input: CaseInput): Promise<Case> {
    return this.http.post<Case>(`update_case/${id}`, input).catch(notFound.case(id));
  }

  /** Sets the same fields on every case; they must all be in `suiteId`. */
  async updateMany(suiteId: number, ids: number[], input: CaseInput): Promise<void> {
    await this.http
      .post<unknown>(`update_cases/${suiteId}`, { ...input, case_ids: ids })
      .catch(notFound.suite(suiteId));
  }

  /** Copies the cases into the section; the originals stay where they are. */
  async copyTo(sectionId: number, ids: number[]): Promise<void> {
    await this.http
      .post<unknown>(`copy_cases_to_section/${sectionId}`, { case_ids: ids })
      .catch(notFound.section(sectionId));
  }

  /** Moves the cases into the section, which is in `suiteId`. */
  async moveTo(sectionId: number, suiteId: number, ids: number[]): Promise<void> {
    await this.http
      .post<unknown>(`move_cases_to_section/${sectionId}`, { suite_id: suiteId, case_ids: ids })
      .catch(notFound.section(sectionId));
  }

  /** Deletes the case and its tests and results in active runs. TestRail has no undo. */
  async remove(id: number): Promise<void> {
    await this.http.post<undefined>(`delete_case/${id}`).catch(notFound.case(id));
  }
}
