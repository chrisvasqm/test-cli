import { notFound, notFoundAs } from "../errors.js";
import type { HttpClient } from "../http.js";
import { collectPages } from "../paging.js";
import { type Collected } from "../../../core/paging.js";
import type { Section } from "../types.js";

export interface SectionInput {
  name: string;
  description?: string;
  /** Required when the project has more than one suite. */
  suite_id?: number;
  /** Left out: a top-level section. */
  parent_id?: number;
}

export interface SectionMove {
  /** null: the top level. */
  parent_id?: number | null;
  /** The sibling to put it after; null: the first place. */
  after_id?: number | null;
}

/** A section named in the body, not the path, that TestRail does not know. */
const missingSection = (field: string, id: number | null | undefined) =>
  notFoundAs(field, "SECTION_NOT_FOUND", `Section ${id} does not exist or you cannot see it.`);

/** get_section(s), add_section, update_section, move_section and delete_section endpoints. */
export class SectionService {
  constructor(private readonly http: HttpClient) {}

  get(id: number): Promise<Section> {
    return this.http.get<Section>(`get_section/${id}`).catch(notFound.section(id));
  }

  list(projectId: number, suiteId: number | undefined, limit: number): Promise<Collected<Section>> {
    return collectPages<Section>(
      `get_sections/${projectId}`,
      "sections",
      { suite_id: suiteId },
      limit,
      this.http,
    );
  }

  add(projectId: number, input: SectionInput): Promise<Section> {
    return this.http
      .post<Section>(`add_section/${projectId}`, input)
      .catch(notFound.project(projectId))
      .catch(missingSection("parent_id", input.parent_id));
  }

  /** Only the fields given change. */
  update(id: number, input: Partial<Pick<SectionInput, "name" | "description">>): Promise<Section> {
    return this.http.post<Section>(`update_section/${id}`, input).catch(notFound.section(id));
  }

  /** Moves the section with its child sections and cases. */
  move(id: number, input: SectionMove): Promise<Section> {
    return this.http
      .post<Section>(`move_section/${id}`, input)
      .catch(notFound.section(id))
      .catch(missingSection("parent_id", input.parent_id))
      .catch(missingSection("after_id", input.after_id));
  }

  /** Deletes the section, its child sections and all their cases. Never with `soft=1`: on Cloud it deletes too. */
  async remove(id: number): Promise<void> {
    await this.http.post<undefined>(`delete_section/${id}`).catch(notFound.section(id));
  }
}
