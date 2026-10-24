import { InputError } from "../core/errors.js";
import type { Run } from "../core/testrail-types.js";
import { joinRefs, splitList, uniqueRefs } from "../core/text.js";
import { CaseService } from "./case.service.js";
import { ResultService } from "./result.service.js";
import { RunService } from "./run.service.js";
import { TestService } from "./test.service.js";

/** What a Jira key is linked to: a case's or run's refs, or a test's result defects. */
export type LinkTarget = RefsTarget | { kind: "test"; id: number };
/** Targets whose links are a refs field, so they can also be removed. */
export type RefsTarget = { kind: "case" | "run"; id: number };

/** Every result is read when collecting a test's defects. */
const ALL_RESULTS = Number.MAX_SAFE_INTEGER;

/** Jira keys on cases and runs (the refs field) and on tests (defects of their results). */
export class LinkService {
  constructor(
    private readonly cases = new CaseService(),
    private readonly runs = new RunService(),
    private readonly tests = new TestService(),
    private readonly results = new ResultService(),
  ) {}

  /**
   * Linked keys in TestRail's order; a test's are deduplicated across its results, oldest first.
   * `runId` is the run a write would change (none for a case), and `run` is it when already read.
   */
  async load(target: LinkTarget): Promise<{ keys: string[]; runId?: number; run?: Run }> {
    if (target.kind === "case") return { keys: splitList((await this.cases.get(target.id)).refs) };
    if (target.kind === "run") {
      const run = await this.runs.get(target.id);
      return { keys: splitList(run.refs), runId: run.id, run };
    }
    const [test, { items }] = await Promise.all([
      this.tests.get(target.id),
      this.tests.results(target.id, ALL_RESULTS),
    ]);
    const keys = uniqueRefs(items.toReversed().flatMap((result) => splitList(result.defects)));
    return { keys, runId: test.run_id };
  }

  /**
   * Adds keys, which must not be linked yet. A test gets a status-less result with a "Linked KAN-1" comment and
   * the keys as defects, so its status stays; results are append-only, so that link cannot be removed.
   */
  async add(target: LinkTarget, current: readonly string[], added: readonly string[]): Promise<void> {
    if (target.kind === "test") {
      // TestRail needs a status or a comment; defects alone are refused.
      await this.results.addForTest(target.id, {
        comment: `Linked ${added.join(", ")}`,
        defects: joinRefs(added),
      });
      return;
    }
    await this.setRefs(target, [...current, ...added]);
  }

  /** Replaces a case's or run's refs. */
  async setRefs(target: RefsTarget, refs: readonly string[]): Promise<void> {
    const input = { refs: joinRefs(refs) };
    if (target.kind === "case") await this.cases.update(target.id, input);
    else await this.runs.update(target.id, input);
  }

  /** Before a write: the run must be open, and update_run cannot change runs inside test plans. */
  async assertWritable(target: LinkTarget, loaded: { runId?: number; run?: Run }): Promise<void> {
    if (loaded.runId === undefined) return;
    const run = await this.runs.open(loaded.runId, loaded.run);
    if (target.kind === "run" && run.plan_id) {
      throw new InputError(
        "RUN_IN_PLAN",
        `R${run.id} is part of test plan ${run.plan_id}; the CLI cannot change refs of runs in plans.`,
      );
    }
  }
}
