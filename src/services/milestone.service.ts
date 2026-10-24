import { notFound, notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages, type Collected } from "../core/paging.js";
import type { Milestone } from "../core/testrail-types.js";

export interface MilestoneInput {
  name: string;
  description?: string;
  /** Unix seconds. */
  start_on?: number;
  /** Unix seconds. */
  due_on?: number;
  parent_id?: number;
  refs?: string;
}

/** get_milestone(s) and add_milestone endpoints. */
export class MilestoneService {
  constructor(private readonly http = HttpClient.get()) {}

  get(id: number): Promise<Milestone> {
    return this.http.get<Milestone>(`get_milestone/${id}`).catch(notFound.milestone(id));
  }

  /** Open milestones, or completed ones when `completed`. */
  list(projectId: number, completed: boolean, limit: number): Promise<Collected<Milestone>> {
    return collectPages<Milestone>(
      `get_milestones/${projectId}`,
      "milestones",
      { is_completed: completed },
      limit,
      this.http,
    );
  }

  add(projectId: number, input: MilestoneInput): Promise<Milestone> {
    return this.http
      .post<Milestone>(`add_milestone/${projectId}`, input)
      .catch(
        notFoundAs(
          "parent_id",
          "MILESTONE_NOT_FOUND",
          `Parent milestone M${input.parent_id} does not exist or you cannot see it.`,
        ),
      );
  }
}
