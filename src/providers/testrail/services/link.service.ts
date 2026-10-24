import type { Run } from "../types.js";
import { joinRefs, splitList, uniqueRefs } from "../../../core/text.js";
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
   * `loaded` is what `load` returned.
   */
  async add(
    target: LinkTarget,
    loaded: { keys: readonly string[]; run?: Run },
    added: readonly string[],
  ): Promise<void> {
    if (target.kind === "test") {
      // TestRail needs a status or a comment; defects alone are refused.
      await this.results.addForTest(target.id, {
        comment: `Linked ${added.join(", ")}`,
        defects: joinRefs(added),
      });
      return;
    }
    await this.setRefs(target, [...loaded.keys, ...added], loaded.run);
  }

  /** Replaces a case's or run's refs; a run in a test plan changes through its plan entry. `run` skips reading it. */
  async setRefs(target: RefsTarget, refs: readonly string[], run?: Run): Promise<void> {
    const input = { refs: joinRefs(refs) };
    if (target.kind === "case") await this.cases.update(target.id, input);
    else await this.runs.update(await this.runs.editable(target.id, run), input);
  }

  /** Before a write: the run must be open. */
  async assertWritable(loaded: { runId?: number; run?: Run }): Promise<void> {
    if (loaded.runId !== undefined) await this.runs.open(loaded.runId, loaded.run);
  }
}
