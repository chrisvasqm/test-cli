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

/** get_case(s) and get_section endpoints. */
export class CaseService {
  constructor(private readonly http = HttpClient.get()) {}

  get(id: number): Promise<Case> {
    return this.http
      .get<Case>(`get_case/${id}`)
      .catch(notFoundAs("case_id", "CASE_NOT_FOUND", `Case C${id} does not exist or you cannot see it.`));
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
}
