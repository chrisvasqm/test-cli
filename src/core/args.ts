import { InputError } from "./errors.js";
import { splitList, uniqueRefs } from "./text.js";

/** Whole number between min and max (inclusive), written as plain digits. */
export function intInRange(raw: string, flag: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const value = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  if (Number.isSafeInteger(value) && value >= min && value <= max) return value;
  const range = max === Number.MAX_SAFE_INTEGER ? `of at least ${min}` : `from ${min} to ${max}`;
  throw new InputError("USAGE", `${flag} must be a whole number ${range}`);
}

/**
 * TestRail shows ids with a letter: C12 (case), R3 (run), T45 (test), P2 (project), S1 (suite).
 * Accepts "C12", "c12" or "12" for that kind; another letter is a usage error. `where` prefixes the
 * error, e.g. "entry 3".
 */
function prefixedId(raw: string, prefix: string, what: string, where?: string): number {
  const match = /^([a-z]?)(\d+)$/i.exec(raw.trim());
  const letter = match?.[1]?.toUpperCase();
  const id = Number(match?.[2]);
  if (!match || (letter && letter !== prefix) || !Number.isSafeInteger(id) || id < 1) {
    throw new InputError(
      "USAGE",
      `${where ? `${where}: ` : ""}"${raw}" is not a ${what} id like ${prefix}12`,
    );
  }
  return id;
}

export const caseId = (raw: string, where?: string): number => prefixedId(raw, "C", "case", where);
export const runId = (raw: string): number => prefixedId(raw, "R", "run");
export const testId = (raw: string): number => prefixedId(raw, "T", "test");
export const projectId = (raw: string): number => prefixedId(raw, "P", "project");
export const suiteId = (raw: string): number => prefixedId(raw, "S", "suite");

/** Upper limit for --limit on list commands. */
const MAX_LIST = 1000;

export function listLimit(raw: string): number {
  return intInRange(raw, "--limit", 1, MAX_LIST);
}

/** "C1,C2,3" → [1, 2, 3]. */
export function caseIds(raw: string): number[] {
  const ids = splitList(raw).map((part) => caseId(part));
  if (ids.length === 0) throw new InputError("USAGE", "--cases needs at least one case id, e.g. C1,C2");
  return ids;
}

/** A case, run or test id; the letter is required, since it says which kind is meant. */
export function kindedId(raw: string): { kind: "case" | "run" | "test"; id: number } {
  const letter = raw.trim()[0]?.toUpperCase();
  if (letter === "C") return { kind: "case", id: caseId(raw) };
  if (letter === "R") return { kind: "run", id: runId(raw) };
  if (letter === "T") return { kind: "test", id: testId(raw) };
  throw new InputError("USAGE", `"${raw}" is not a case, run or test id like C12, R3 or T45`);
}

/** A case, run or test id (C12, R3, T45), or a Jira key (KAN-12): a Jira key has a dash. */
export function idOrJiraKey(
  raw: string,
): { kind: "case" | "run" | "test"; id: number } | { kind: "key"; key: string } {
  if (!raw.includes("-")) {
    const letter = raw.trim()[0]?.toUpperCase();
    if (letter === "C" || letter === "R" || letter === "T") return kindedId(raw);
    throw new InputError(
      "USAGE",
      `"${raw}" is not a case, run or test id like C12, R3 or T45, or a Jira key like KAN-12`,
    );
  }
  return { kind: "key", key: jiraKey(raw, "<target>") };
}

/** "KAN-1 KAN-2" or "KAN-1,KAN-2" → ["KAN-1", "KAN-2"], upper-cased, duplicates dropped. */
export function jiraKeys(raw: readonly string[]): string[] {
  const keys = raw.flatMap((part) => splitList(part)).map((key) => key.toUpperCase());
  const bad = keys.filter((key) => !/^[A-Z][A-Z0-9_]*-[1-9]\d*$/.test(key));
  if (bad.length > 0) throw new InputError("USAGE", `Not a Jira key like KAN-12: ${bad.join(", ")}`);
  if (keys.length === 0) throw new InputError("USAGE", "Give at least one Jira key, e.g. KAN-12");
  return uniqueRefs(keys);
}

/** One Jira key, for a flag such as --from-jira. */
export function jiraKey(raw: string, flag: string): string {
  const keys = jiraKeys([raw]);
  if (keys.length > 1) throw new InputError("USAGE", `${flag} takes one Jira key, e.g. KAN-12`);
  return keys[0]!;
}

/** "2026-10-01" (UTC midnight) or a full ISO time → Unix seconds, for TestRail's *_after filters. */
export function sinceDate(raw: string, flag: string): number {
  const ms = /^\d{4}-\d{2}-\d{2}/.test(raw.trim()) ? Date.parse(raw.trim()) : Number.NaN;
  if (Number.isNaN(ms)) throw new InputError("USAGE", `${flag} must be a date like 2026-10-01`);
  return Math.floor(ms / 1000);
}
