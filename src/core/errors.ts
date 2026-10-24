export class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    /** HTTP status when the error came from TestRail. */
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CliError";
  }
}

/**
 * Catch handler that turns "this id does not exist" into a specific error. TestRail answers an
 * unknown path id with 404, or with 400 naming the field: "Field :case_id is not a valid test case."
 * Only that field counts, so a bad value elsewhere (e.g. :priority_id) stays a TESTRAIL_ERROR.
 */
export function notFoundAs(field: string, code: string, message: string): (err: unknown) => never {
  return (err: unknown) => {
    if (err instanceof CliError && isMissing(err, field)) throw new CliError(code, message, err.message);
    throw err;
  };
}

function isMissing(err: CliError, field: string): boolean {
  if (err.code === "NOT_FOUND") return true;
  return err.status === 400 && err.message.includes(`:${field} is not a valid`);
}
