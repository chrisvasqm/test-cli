import { stripVTControlCharacters } from "node:util";
import { CliError } from "./errors.js";

export type OutputMode = "human" | "json";

export function printResult(mode: OutputMode, data: unknown, human: () => string): void {
  if (mode === "json") {
    process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
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

/** Newline, tab, and the zero-width joiner and tag characters that emoji sequences need. */
function keep(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return char === "\n" || char === "\t" || code === 0x200d || (code >= 0xe0020 && code <= 0xe007f);
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
    process.stdout.write(`${JSON.stringify({ ok: false, error: { code, message, details } })}\n`);
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

export function table(rows: ReadonlyArray<readonly [string, string]>): string {
  const width = Math.max(...rows.map(([key]) => key.length));
  return rows.map(([key, value]) => `${key.padEnd(width)}  ${value}`).join("\n");
}
