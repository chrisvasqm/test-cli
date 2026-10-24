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

/** update_milestone fields: any of add_milestone's, plus the started and completed flags. */
export interface MilestoneUpdate extends Partial<MilestoneInput> {
  is_started?: boolean;
  is_completed?: boolean;
}

/** get_milestone(s), add_milestone, update_milestone and delete_milestone endpoints. */
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
    ).catch(notFound.project(projectId));
  }

  add(projectId: number, input: MilestoneInput): Promise<Milestone> {
    const added = this.http.post<Milestone>(`add_milestone/${projectId}`, input);
    if (input.parent_id === undefined) return added.catch(notFound.project(projectId));
    return added.catch(unknownParent(input.parent_id));
  }

  /** Only the fields given change. */
  update(id: number, input: MilestoneUpdate): Promise<Milestone> {
    const updated = this.http.post<Milestone>(`update_milestone/${id}`, input).catch(notFound.milestone(id));
    return input.parent_id === undefined ? updated : updated.catch(unknownParent(input.parent_id));
  }

  /** Deletes the milestone. Never with `soft=1`: on Cloud it deletes too. */
  async remove(id: number): Promise<void> {
    await this.http.post<undefined>(`delete_milestone/${id}`).catch(notFound.milestone(id));
  }
}

function unknownParent(parentId: number): (err: unknown) => never {
  return notFoundAs(
    "parent_id",
    "MILESTONE_NOT_FOUND",
    `Parent milestone M${parentId} does not exist or you cannot see it.`,
  );
}
