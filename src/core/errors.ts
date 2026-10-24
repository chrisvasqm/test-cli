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

  /**
   * The same error with `note` after the message, e.g. what already happened so a retry does not
   * repeat it. `details` replaces the original ones when given. Always a plain CliError (exit 1).
   */
  withNote(note: string, details: unknown = this.details): CliError {
    return new CliError(this.code, `${this.message} ${note}`, details, this.status, this.field);
  }
}

/** A problem with what the user typed or piped in: exits 2, and retrying it unchanged fails again. */
export class InputError extends CliError {}
