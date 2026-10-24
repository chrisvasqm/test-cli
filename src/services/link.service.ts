import { InputError } from "../core/errors.js";
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
   * `forWrite` refuses a run inside a test plan: update_run cannot change those.
   */
  async keys(target: LinkTarget, forWrite = false): Promise<string[]> {
    if (target.kind === "case") return splitList((await this.cases.get(target.id)).refs);
    if (target.kind === "run") {
      const run = await this.runs.get(target.id);
      if (forWrite && run.plan_id !== null) {
        throw new InputError(
          "RUN_IN_PLAN",
          `R${target.id} is part of test plan ${run.plan_id}; the CLI cannot change refs of runs in plans.`,
        );
      }
      return splitList(run.refs);
    }
    // get_results maps an unknown test to TEST_NOT_FOUND itself.
    const { items } = await this.tests.results(target.id, ALL_RESULTS);
    return uniqueRefs(items.toReversed().flatMap((result) => splitList(result.defects)));
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
}
