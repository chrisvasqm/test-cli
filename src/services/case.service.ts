import { notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages, type Collected } from "../core/paging.js";
import type { Case, Section } from "../core/testrail-types.js";

export interface CaseFilter {
  projectId: number;
  suiteId: number | undefined;
  sectionId: number | undefined;
  limit: number;
}

/** Writable case fields; custom_* fields depend on the case's template. */
export interface CaseInput {
  title?: string;
  template_id?: number;
  type_id?: number;
  priority_id?: number;
  refs?: string;
  estimate?: string;
  custom_preconds?: string;
  custom_steps?: string;
  custom_expected?: string;
  custom_steps_separated?: { content: string; expected: string }[];
}

const caseNotFound = (id: number) =>
  notFoundAs("case_id", "CASE_NOT_FOUND", `Case C${id} does not exist or you cannot see it.`);

/** get/add/update/delete_case, get_cases and get_section(s) endpoints. */
export class CaseService {
  constructor(private readonly http = HttpClient.get()) {}

  get(id: number): Promise<Case> {
    return this.http.get<Case>(`get_case/${id}`).catch(caseNotFound(id));
  }

  list(filter: CaseFilter): Promise<Collected<Case>> {
    return collectPages<Case>(
      `get_cases/${filter.projectId}`,
      "cases",
      { suite_id: filter.suiteId, section_id: filter.sectionId },
      filter.limit,
      this.http,
    ).catch(
      notFoundAs(
        "section_id",
        "SECTION_NOT_FOUND",
        `Section ${filter.sectionId} does not exist in this project.`,
      ),
    );
  }

  section(id: number): Promise<Section> {
    return this.http
      .get<Section>(`get_section/${id}`)
      .catch(notFoundAs("section_id", "SECTION_NOT_FOUND", `Section ${id} does not exist.`));
  }

  add(sectionId: number, input: CaseInput & { title: string }): Promise<Case> {
    return this.http
      .post<Case>(`add_case/${sectionId}`, input)
      .catch(notFoundAs("section_id", "SECTION_NOT_FOUND", `Section ${sectionId} does not exist.`));
  }

  /** Only the fields given change. */
  update(id: number, input: CaseInput): Promise<Case> {
    return this.http.post<Case>(`update_case/${id}`, input).catch(caseNotFound(id));
  }

  /** Deletes the case and its tests and results in active runs. TestRail has no undo. */
  async remove(id: number): Promise<void> {
    await this.http.post<undefined>(`delete_case/${id}`).catch(caseNotFound(id));
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
