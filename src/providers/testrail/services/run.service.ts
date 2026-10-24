import { notFound, notFoundAs } from "../errors.js";
import { CliError, InputError } from "../../../core/errors.js";
import type { HttpClient } from "../http.js";
import { collectPages } from "../paging.js";
import { ALL, inBatches, type Collected } from "../../../core/paging.js";
import type { Plan, PlanEntry, PlanRun, Run } from "../types.js";
import { hasRef } from "../../../core/text.js";
import type { PlanService } from "./plan.service.js";

/** A run with the plan it belongs to (null outside plans). */
export interface OpenRun {
  run: Run | PlanRun;
  plan: Plan | null;
}

/** Which runs to list; a field left out matches every run. */
export interface RunFilter {
  /** true: only closed runs; false: only open ones. */
  completed?: boolean | undefined;
  milestoneId?: number | undefined;
  suiteId?: number | undefined;
}

/** An open run and, inside a test plan, its plan entry, which decides how TestRail changes it. */
export interface EditableRun {
  run: Run;
  entry: PlanEntry | null;
}

export interface RunInput {
  name: string;
  suite_id?: number;
  description?: string;
  milestone_id?: number;
  refs?: string;
  assignedto_id?: number;
  /** true: every case in the suite; false: only case_ids. */
  include_all: boolean;
  case_ids?: number[];
}

export type RunChange = Partial<Omit<RunInput, "suite_id">>;

/**
 * get_run(s), add_run, update_run and close_run endpoints, plus update_plan_entry and
 * update_run_in_plan_entry for runs inside test plans. get_runs leaves out runs in plans.
 */
export class RunService {
  constructor(
    private readonly http: HttpClient,
    private readonly plans: PlanService,
  ) {}

  get(id: number): Promise<Run> {
    return this.http.get<Run>(`get_run/${id}`).catch(notFound.run(id));
  }

  /** Runs not in a plan, newest first, matching the filter. */
  list(projectId: number, limit: number, filter: RunFilter = {}): Promise<Collected<Run>> {
    return collectPages<Run>(
      `get_runs/${projectId}`,
      "runs",
      { is_completed: filter.completed, milestone_id: filter.milestoneId, suite_id: filter.suiteId },
      limit,
      this.http,
    ).catch(notFound.project(projectId));
  }

  /** Every open run, those inside open plans too (get_runs leaves them out), newest first. */
  async allOpen(projectId: number, milestoneId?: number): Promise<OpenRun[]> {
    const [runs, planList] = await Promise.all([
      this.list(projectId, ALL, { completed: false, milestoneId }),
      this.plans.list(projectId, false, ALL, milestoneId),
    ]);
    // get_plans leaves out the entries, so each plan is read on its own.
    const full = await inBatches(planList.items, (item) => this.plans.get(item.id));
    const inPlans = full.flatMap((plan) =>
      (plan.entries ?? []).flatMap((entry) => entry.runs.map((run) => ({ run, plan }))),
    );
    const open = [...runs.items.map((run) => ({ run, plan: null })), ...inPlans];
    return open
      .filter((item) => !item.run.is_completed)
      .toSorted((left, right) => right.run.id - left.run.id);
  }

  /** Every run (not in a plan), open or closed, whose refs include `key` (exactly, ignoring case; TestRail's refs_filter is looser). */
  async withRef(projectId: number, suiteId: number | undefined, key: string): Promise<Run[]> {
    const { items } = await collectPages<Run>(
      `get_runs/${projectId}`,
      "runs",
      { refs_filter: key, suite_id: suiteId },
      ALL,
      this.http,
    );
    return items.filter((item) => hasRef(item.refs, key));
  }

  add(projectId: number, input: RunInput): Promise<Run> {
    // TestRail: "Field :case_ids contains unrecognized case IDs." (deleted, or in another suite).
    return this.http
      .post<Run>(`add_run/${projectId}`, input)
      .catch(
        notFoundAs("case_ids", "CASE_NOT_FOUND", "Some --cases ids are not cases in this project and suite."),
      );
  }

  /** The run, which must be open: TestRail refuses changes and new results in a closed run. `known` skips the request. */
  async open(id: number, known?: Run): Promise<Run> {
    const run = known ?? (await this.get(id));
    if (run.is_completed) {
      throw new InputError("RUN_CLOSED", `Run R${id} is closed; TestRail takes no changes or results in it.`);
    }
    return run;
  }

  /** The open run with its plan entry (null outside plans); get_run leaves out the entry, so the plan is read. */
  async editable(id: number, known?: Run): Promise<EditableRun> {
    const run = await this.open(id, known);
    if (run.plan_id === null) return { run, entry: null };
    const plan = await this.plans.get(run.plan_id);
    const entry = plan.entries?.find((item) => item.runs.some((planRun) => planRun.id === id));
    if (!entry)
      throw new CliError("RUN_NOT_FOUND", `Run R${id} is not in the entries of plan R${run.plan_id}.`);
    return { run, entry };
  }

  /**
   * Only the fields given change. TestRail refuses changes to a closed run. `case_ids` is the whole
   * new list (with include_all false): cases left out lose their tests and results.
   */
  async update(target: EditableRun, input: RunChange): Promise<Run> {
    this.assertChangeable(target, input);
    const { run, entry } = target;
    const request = entry
      ? this.updateInPlan(run, entry, input)
      : this.http.post<Run>(`update_run/${run.id}`, input);
    return request
      .catch(notFound.run(run.id))
      .catch(notFoundAs("case_ids", "CASE_NOT_FOUND", "Some case ids are not cases in this run's suite."))
      .catch(notFoundAs("milestone_id", "MILESTONE_NOT_FOUND", "The milestone is not one in this project."));
  }

  /**
   * Fails with RUN_IN_PLAN for the changes TestRail cannot make to a run in a plan: its milestone is
   * the plan's, and a run with sibling configuration runs is renamed only with them.
   */
  assertChangeable(target: EditableRun, input: RunChange): void {
    const { run, entry } = target;
    if (!entry) return;
    const where = `Run R${run.id} is part of plan R${run.plan_id}`;
    if (input.milestone_id !== undefined) {
      throw new InputError("RUN_IN_PLAN", `${where}; its milestone is the plan's.`);
    }
    if (input.name !== undefined && entry.runs.length > 1) {
      throw new InputError(
        "RUN_IN_PLAN",
        `${where} with other configuration runs; TestRail renames them only together.`,
      );
    }
  }

  /**
   * update_run refuses runs in plans. The entry's only run changes with update_plan_entry
   * (update_run_in_plan_entry fails with a 500 there); a run with sibling configuration runs
   * changes alone with update_run_in_plan_entry.
   */
  private async updateInPlan(run: Run, entry: PlanEntry, input: RunChange): Promise<Run> {
    if (entry.runs.length > 1) return this.http.post<Run>(`update_run_in_plan_entry/${run.id}`, input);
    const updated = await this.http.post<PlanEntry>(`update_plan_entry/${run.plan_id}/${entry.id}`, input);
    return updated.runs.find((item) => item.id === run.id) ?? { ...run, ...input };
  }

  /**
   * Closing archives the run: TestRail cannot reopen it, and its results can no longer change.
   * A run in a plan closes only with its plan. `known` skips reading the run.
   */
  async close(id: number, known?: Run): Promise<Run> {
    this.assertClosable(known ?? (await this.get(id)));
    return this.http.post<Run>(`close_run/${id}`).catch(notFound.run(id));
  }

  /** close_run refuses runs in plans ("cannot be closed independently"): they close with the plan. */
  assertClosable(run: Run): void {
    if (run.plan_id === null) return;
    throw new InputError(
      "RUN_IN_PLAN",
      `Run R${run.id} is part of plan R${run.plan_id}; TestRail closes it only with the plan (plan close R${run.plan_id}).`,
    );
  }

  /** Deletes the run with its tests and results. Never with `soft=1`: on Cloud it deletes too. */
  async remove(id: number): Promise<void> {
    await this.http.post<undefined>(`delete_run/${id}`).catch(notFound.run(id));
  }
}
