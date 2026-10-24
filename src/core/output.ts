import { stripVTControlCharacters } from "node:util";
import { CliError } from "./errors.js";

export type OutputMode = "human" | "json";

// A reader that stops early (`testrail case list | head`) closes the pipe; that is not an error.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EPIPE") throw err;
    process.exit(process.exitCode ?? 0);
  });
}

export function printResult(mode: OutputMode, data: unknown, human: () => string): void {
  if (mode === "json") {
    process.stdout.write(`${toJson({ ok: true, data })}\n`);
    return;
  }
  process.stdout.write(`${stripControls(human())}\n`);
}

/** Control and invisible format characters. */
const HIDDEN = /[\p{Cc}\p{Cf}]/gu;
/** Longest raw error body shown in human mode (e.g. an HTML error page). */
const MAX_DETAIL_CHARS = 500;

/**
 * TestRail text is user-written, so drop terminal escape sequences, control characters
 * and invisible bidi or zero-width marks before it reaches a terminal.
 */
export function stripControls(text: string): string {
  return stripVTControlCharacters(text).replace(HIDDEN, (char) => (keep(char) ? char : ""));
}

/**
 * Newline, tab, and the zero-width joiner that emoji sequences need. Unicode tag characters are
 * dropped: they can carry invisible text aimed at agents (only subdivision flags lose detail).
 */
function keep(char: string): boolean {
  return char === "\n" || char === "\t" || char === "\u200d";
}

/** JSON for agents gets the same cleaning as terminal text: every string value is stripped. */
function toJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "string" ? stripControls(item) : item,
  );
}

/** A note for people (progress, hints) on stderr, so stdout stays the result. */
export function info(text: string): void {
  process.stderr.write(`${stripControls(text)}\n`);
}

export function printError(mode: OutputMode, err: unknown): void {
  const code = err instanceof CliError ? err.code : "UNEXPECTED";
  const message = err instanceof Error ? err.message : String(err);
  const details = err instanceof CliError ? err.details : undefined;
  if (mode === "json") {
    process.stdout.write(`${toJson({ ok: false, error: { code, message, details } })}\n`);
    return;
  }
  process.stderr.write(`error [${code}]: ${stripControls(message)}\n`);
  const rendered = renderDetails(details);
  if (rendered) process.stderr.write(`${stripControls(rendered)}\n`);
}

function renderDetails(details: unknown): string | undefined {
  if (details === undefined || details === null) return undefined;
  if (typeof details === "string") {
    return details.length > MAX_DETAIL_CHARS ? `${details.slice(0, MAX_DETAIL_CHARS)}…` : details;
  }
  if (Array.isArray(details) && details.every((item) => typeof item === "string")) {
    return details.map((line) => `  ${line}`).join("\n");
  }
  // Structured details (e.g. config issues) are for --json; the message already explains.
  return undefined;
}

/** Key/value rows ("Status  Failed"). */
export function table(rows: ReadonlyArray<readonly [string, string]>): string {
  return grid(rows);
}

/** Columns padded to the widest cell; the last column is never padded. */
export function grid(rows: ReadonlyArray<readonly string[]>): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => (widths[index] = Math.max(widths[index] ?? 0, cell.length)));
  }
  return rows
    .map((row) =>
      row
        .map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index]!)))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

/** "Showing 50; more exist (raise --limit)" when a list was cut. */
export function moreHint(shown: number, hasMore: boolean): string {
  return hasMore ? `\n\nShowing ${shown}; more exist (raise --limit).` : "";
}

/** A list command's text: the rows as a grid, `empty` when there are none, plus the --limit hint. */
export function renderList(rows: ReadonlyArray<readonly string[]>, empty: string, hasMore: boolean): string {
  return rows.length === 0 ? empty : grid(rows) + moreHint(rows.length, hasMore);
}
