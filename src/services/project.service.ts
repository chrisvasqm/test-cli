import { notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages } from "../core/paging.js";
import type { Project, Suite } from "../core/testrail-types.js";

/** Most projects one account can list at once. */
const MAX_PROJECTS = 1000;

/** get_project(s) and get_suites endpoints. */
export class ProjectService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Active projects only; completed ones are archived. */
  async listActive(): Promise<Project[]> {
    const { items } = await collectPages<Project>(
      "get_projects",
      "projects",
      { is_completed: false },
      MAX_PROJECTS,
      this.http,
    );
    return items;
  }

  get(id: number): Promise<Project> {
    return this.http
      .get<Project>(`get_project/${id}`)
      .catch(notFoundAs("PROJECT_NOT_FOUND", `Project P${id} does not exist or you cannot see it.`));
  }

  suites(projectId: number): Promise<Suite[]> {
    return this.http
      .get<Suite[]>(`get_suites/${projectId}`)
      .catch(notFoundAs("PROJECT_NOT_FOUND", `Project P${projectId} does not exist or you cannot see it.`));
  }
}
