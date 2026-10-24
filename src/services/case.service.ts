import { InputError, notFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages, type Collected } from "../core/paging.js";
import { sameKey, splitList } from "../core/text.js";
import type { Case, CaseContent, Section } from "../core/testrail-types.js";

export interface CaseFilter {
  projectId: number;
  suiteId: number | undefined;
  sectionId: number | undefined;
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

/** get/add/update/delete_case, get_cases and get_section(s) endpoints. */
export class CaseService {
  constructor(private readonly http = HttpClient.get()) {}

  get(id: number): Promise<Case> {
    return this.http.get<Case>(`get_case/${id}`).catch(notFound.case(id));
  }

  list(filter: CaseFilter): Promise<Collected<Case>> {
    const page = collectPages<Case>(
      `get_cases/${filter.projectId}`,
      "cases",
      { suite_id: filter.suiteId, section_id: filter.sectionId },
      filter.limit,
      this.http,
    );
    // Only a filtered list can miss its section; any other 404 stays NOT_FOUND.
    return filter.sectionId === undefined ? page : page.catch(notFound.section(filter.sectionId));
  }

  /** Every case whose refs include `key` (exactly, ignoring case; TestRail's refs filter is looser). */
  async linkedTo(projectId: number, suiteId: number | undefined, key: string): Promise<Case[]> {
    const { items } = await collectPages<Case>(
      `get_cases/${projectId}`,
      "cases",
      { suite_id: suiteId, refs: key },
      Number.MAX_SAFE_INTEGER,
      this.http,
    );
    return items.filter((item) => splitList(item.refs).some((ref) => sameKey(ref, key)));
  }

  /** Ids of the cases linked to `key`; NO_LINKED_CASES when there are none (a run of them would be empty). */
  async linkedIds(projectId: number, suiteId: number | undefined, key: string): Promise<number[]> {
    const linked = await this.linkedTo(projectId, suiteId, key);
    if (linked.length === 0) {
      throw new InputError(
        "NO_LINKED_CASES",
        `No case in this project${suiteId === undefined ? "" : " and suite"} has ${key} in its refs. Link some with \`testrail link add C12 ${key}\`, or pass --cases.`,
      );
    }
    return linked.map((item) => item.id);
  }

  section(id: number): Promise<Section> {
    return this.http.get<Section>(`get_section/${id}`).catch(notFound.section(id));
  }

  add(sectionId: number, input: CaseInput & { title: string }): Promise<Case> {
    return this.http.post<Case>(`add_case/${sectionId}`, input).catch(notFound.section(sectionId));
  }

  /** Only the fields given change. */
  update(id: number, input: CaseInput): Promise<Case> {
    return this.http.post<Case>(`update_case/${id}`, input).catch(notFound.case(id));
  }

  /** Deletes the case and its tests and results in active runs. TestRail has no undo. */
  async remove(id: number): Promise<void> {
    await this.http.post<undefined>(`delete_case/${id}`).catch(notFound.case(id));
  }

  sections(projectId: number, suiteId: number | undefined, limit: number): Promise<Collected<Section>> {
    return collectPages<Section>(
      `get_sections/${projectId}`,
      "sections",
      { suite_id: suiteId },
      limit,
      this.http,
    );
  }
}
