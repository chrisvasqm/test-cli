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

/** Catch handler that turns the generic NOT_FOUND into a specific, clearer error. */
export function notFoundAs(code: string, message: string): (err: unknown) => never {
  return (err: unknown) => {
    if (err instanceof CliError && err.code === "NOT_FOUND") throw new CliError(code, message, err.message);
    throw err;
  };
}
