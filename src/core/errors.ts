export class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    /** HTTP status when the error came from TestRail. */
    public readonly status?: number,
    /** The field a TestRail 400 names ("Field :case_id is not a valid test case." → "case_id"). */
    public readonly field?: string,
  ) {
    super(message);
    this.name = "CliError";
  }
}

/** A problem with what the user typed or piped in: exits 2, and retrying it unchanged fails again. */
export class InputError extends CliError {}

/** "run_id" and "run" name the same field. */
const bare = (name: string | undefined): string | undefined => name?.replace(/_id$/, "");

/**
 * Catch handler that turns "this id does not exist" into a specific error. TestRail answers an
 * unknown path id with 404, or with 400 naming the field ("Field :case_id is not a valid test case.").
 * Only that field counts, so a bad value elsewhere (e.g. :priority_id) stays a TESTRAIL_ERROR.
 * Some endpoints drop the "_id" (get_run: "Field :run is not a valid test run."), so it is ignored.
 */
export function notFoundAs(field: string, code: string, message: string): (err: unknown) => never {
  return (err: unknown) => {
    const missing =
      err instanceof CliError &&
      (err.code === "NOT_FOUND" || (err.status === 400 && bare(err.field) === bare(field)));
    if (missing) throw new CliError(code, message, err.message);
    throw err;
  };
}

const cannotSee = "does not exist or you cannot see it.";

/** The not-found handler for each kind of id in a path. */
export const notFound = {
  project: (id: number) => notFoundAs("project_id", "PROJECT_NOT_FOUND", `Project P${id} ${cannotSee}`),
  section: (id: number | undefined) =>
    notFoundAs("section_id", "SECTION_NOT_FOUND", `Section ${id} ${cannotSee}`),
  case: (id: number) => notFoundAs("case_id", "CASE_NOT_FOUND", `Case C${id} ${cannotSee}`),
  run: (id: number) => notFoundAs("run_id", "RUN_NOT_FOUND", `Run R${id} ${cannotSee}`),
  test: (id: number) => notFoundAs("test_id", "TEST_NOT_FOUND", `Test T${id} ${cannotSee}`),
  suite: (id: number) => notFoundAs("suite_id", "SUITE_NOT_FOUND", `Suite S${id} ${cannotSee}`),
  milestone: (id: number) =>
    notFoundAs("milestone_id", "MILESTONE_NOT_FOUND", `Milestone M${id} ${cannotSee}`),
  result: (id: number) => notFoundAs("result_id", "RESULT_NOT_FOUND", `Result #${id} ${cannotSee}`),
  plan: (id: number) => notFoundAs("plan_id", "PLAN_NOT_FOUND", `Plan R${id} ${cannotSee}`),
};
