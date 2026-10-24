import { notFound, notFoundAs } from "../errors.js";
import type { HttpClient } from "../http.js";
import { collectPages } from "../paging.js";
import { type Collected } from "../../../core/paging.js";
import type { Plan, PlanEntry } from "../types.js";

/** Which cases a run gets and who it is assigned to. */
export interface PlanRunInput {
  /** true: every case in the suite; false: only case_ids. */
  include_all: boolean;
  case_ids?: number[];
  assignedto_id?: number;
  config_ids?: number[];
}

/** One suite's runs in a plan; `runs` has one item per configuration combination. */
export interface PlanEntryInput extends PlanRunInput {
  suite_id: number;
  /** TestRail names the entry after the suite when omitted. */
  name?: string;
  runs?: PlanRunInput[];
}

export interface PlanInput {
  name: string;
  description?: string;
  milestone_id?: number;
  entries?: PlanEntryInput[];
}

/** The errors an entry's ids can cause, after the path id's own handler. */
const entryErrors = (input: PlanEntryInput) => [
  notFound.suite(input.suite_id),
  // As add_run: "Field :case_ids contains unrecognized case IDs." (deleted, or in another suite).
  notFoundAs("case_ids", "CASE_NOT_FOUND", "Some --cases ids are not cases in this suite."),
  notFoundAs("config_ids", "CONFIG_NOT_FOUND", "Some --configs are not configurations of this project."),
];

/** Applies each not-found handler in turn; each rethrows what it does not recognise. */
function withHandlers<T>(request: Promise<T>, handlers: ReadonlyArray<(err: unknown) => never>): Promise<T> {
  return handlers.reduce((promise, handler) => promise.catch(handler), request);
}

/** get_plan(s), add_plan, add_plan_entry, close_plan and delete_plan endpoints. */
export class PlanService {
  constructor(private readonly http: HttpClient) {}

  get(id: number): Promise<Plan> {
    return this.http.get<Plan>(`get_plan/${id}`).catch(notFound.plan(id));
  }

  /** Open plans, or completed ones when `completed`, optionally only a milestone's; get_plans leaves out the entries. */
  list(projectId: number, completed: boolean, limit: number, milestoneId?: number): Promise<Collected<Plan>> {
    return collectPages<Plan>(
      `get_plans/${projectId}`,
      "plans",
      { is_completed: completed, milestone_id: milestoneId },
      limit,
      this.http,
    ).catch(notFound.project(projectId));
  }

  add(projectId: number, input: PlanInput): Promise<Plan> {
    const handlers = [
      notFound.project(projectId),
      ...(input.milestone_id === undefined ? [] : [notFound.milestone(input.milestone_id)]),
      ...(input.entries ?? []).flatMap(entryErrors),
    ];
    return withHandlers(this.http.post<Plan>(`add_plan/${projectId}`, input), handlers);
  }

  /** Adds one suite's runs to an open plan. */
  addEntry(id: number, input: PlanEntryInput): Promise<PlanEntry> {
    return withHandlers(this.http.post<PlanEntry>(`add_plan_entry/${id}`, input), [
      notFound.plan(id),
      ...entryErrors(input),
    ]);
  }

  /** Closing archives the plan and its runs: TestRail cannot reopen it. */
  close(id: number): Promise<Plan> {
    return this.http.post<Plan>(`close_plan/${id}`).catch(notFound.plan(id));
  }

  /** Deletes the plan with its runs, tests and results. Never with `soft=1`: on Cloud it deletes too. */
  async remove(id: number): Promise<void> {
    await this.http.post<undefined>(`delete_plan/${id}`).catch(notFound.plan(id));
  }
}
