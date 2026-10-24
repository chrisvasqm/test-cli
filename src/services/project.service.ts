import { notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages, type Collected } from "../core/paging.js";
import type { Project, Suite } from "../core/testrail-types.js";

/** Most projects one account can list at once. */
const MAX_PROJECTS = 1000;

/** get_projects and get_suites endpoints. */
export class ProjectService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Active projects only; completed ones are archived. `hasMore` is true past MAX_PROJECTS. */
  listActive(): Promise<Collected<Project>> {
    return collectPages<Project>(
      "get_projects",
      "projects",
      { is_completed: false },
      MAX_PROJECTS,
      this.http,
    );
  }

  suites(projectId: number): Promise<Suite[]> {
    return this.http
      .get<Suite[]>(`get_suites/${projectId}`)
      .catch(
        notFoundAs(
          "project_id",
          "PROJECT_NOT_FOUND",
          `Project P${projectId} does not exist or you cannot see it.`,
        ),
      );
  }
}
