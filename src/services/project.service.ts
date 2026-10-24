import { CliError, notFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages, MAX_LIST, type Collected } from "../core/paging.js";
import type { Project, Suite } from "../core/testrail-types.js";

/** get_project(s) and get_suites endpoints. */
export class ProjectService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Active projects only; completed ones are archived. `hasMore` is true past MAX_LIST. */
  listActive(): Promise<Collected<Project>> {
    return collectPages<Project>("get_projects", "projects", { is_completed: false }, MAX_LIST, this.http);
  }

  get(id: number): Promise<Project> {
    return this.http.get<Project>(`get_project/${id}`).catch(notFound.project(id));
  }

  /** get_suites is paged on newer servers (`{suites: [...]}`) and a bare array on older ones. */
  async suites(projectId: number): Promise<Suite[]> {
    const { items } = await collectPages<Suite>(
      `get_suites/${projectId}`,
      "suites",
      {},
      MAX_LIST,
      this.http,
    ).catch(notFound.project(projectId));
    return items;
  }

  /** Suites that are not completed; NO_SUITES when there are none. */
  async activeSuites(projectId: number): Promise<Suite[]> {
    const active = (await this.suites(projectId)).filter((item) => !item.is_completed);
    if (active.length === 0) throw new CliError("NO_SUITES", `Project P${projectId} has no active suites.`);
    return active;
  }
}
