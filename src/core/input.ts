import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { text as readStream } from "node:stream/consumers";
import { InputError } from "./errors.js";
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
    throw new InputError("USAGE", `Give the ${what} as text or with --file, not both`);
  }
  const raw = inline ?? (file === undefined ? undefined : await readSource(file));
  if (raw === undefined)
    throw new InputError("USAGE", `Give the ${what} as text, or with --file <path> (- reads stdin)`);
  if (!raw.trim()) throw new InputError("USAGE", `The ${what} is empty`);
  return raw;
}

async function readSource(file: string): Promise<string> {
  if (file === "-") {
    if (process.stdin.isTTY) info("Reading from the terminal; end with Ctrl+D.");
    return readStream(process.stdin);
  }
  return readFile(file, "utf8").catch((err: unknown) => {
    throw new InputError(
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

/** TestRail's limit for one attachment. */
const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

/** A file checked for upload: it exists, is a regular file and fits TestRail's limit. */
export interface Upload {
  path: string;
  name: string;
  size: number;
}

/** Checks every file before anything is sent, so a bad path never leaves half the files uploaded. */
export async function checkUploads(paths: readonly string[]): Promise<Upload[]> {
  if (paths.length === 0) throw new InputError("USAGE", "Give at least one file to attach");
  return Promise.all(paths.map((path) => checkUpload(path)));
}

async function checkUpload(path: string): Promise<Upload> {
  const found = await stat(path).catch((err: unknown) => {
    throw new InputError(
      "FILE_ERROR",
      `Cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  if (!found.isFile()) throw new InputError("FILE_ERROR", `${path} is not a file`);
  if (found.size > MAX_UPLOAD_BYTES) {
    throw new InputError("FILE_TOO_LARGE", `${path} is over TestRail's 256 MB limit for one attachment`);
  }
  return { path, name: basename(path), size: found.size };
}
