import { readFile } from "node:fs/promises";
import { text as readStream } from "node:stream/consumers";
import { CliError } from "./errors.js";
import { info } from "./output.js";

/**
 * Text for a write command: given inline, or with --file <path> ("-" reads stdin).
 * `what` names the text in error messages, e.g. "comment".
 */
export async function readText(
  inline: string | undefined,
  file: string | undefined,
  what: string,
): Promise<string> {
  if (inline !== undefined && file !== undefined) {
    throw new CliError("USAGE", `Give the ${what} as text or with --file, not both`);
  }
  const raw = inline ?? (file === undefined ? undefined : await readSource(file));
  if (raw === undefined)
    throw new CliError("USAGE", `Give the ${what} as text, or with --file <path> (- reads stdin)`);
  if (!raw.trim()) throw new CliError("USAGE", `The ${what} is empty`);
  return raw;
}

async function readSource(file: string): Promise<string> {
  if (file === "-") {
    if (process.stdin.isTTY) info("Reading from the terminal; end with Ctrl+D.");
    return readStream(process.stdin);
  }
  return readFile(file, "utf8").catch((err: unknown) => {
    throw new CliError(
      "FILE_ERROR",
      `Cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}

/** Like readText, but giving neither the text nor --file is fine (returns undefined). */
export async function readOptionalText(
  inline: string | undefined,
  file: string | undefined,
  what: string,
): Promise<string | undefined> {
  if (inline === undefined && file === undefined) return undefined;
  return readText(inline, file, what);
}
