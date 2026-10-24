import { CliError } from "./errors.js";

/** Whole number between min and max (inclusive), written as plain digits. */
export function intInRange(raw: string, flag: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const value = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  if (Number.isSafeInteger(value) && value >= min && value <= max) return value;
  const range = max === Number.MAX_SAFE_INTEGER ? `of at least ${min}` : `from ${min} to ${max}`;
  throw new CliError("USAGE", `${flag} must be a whole number ${range}`);
}

/**
 * TestRail shows ids with a letter: C12 (case), R3 (run), T45 (test), P2 (project), S1 (suite).
 * Accepts "C12", "c12" or "12" for that kind; another letter is a usage error.
 */
function prefixedId(raw: string, prefix: string, what: string): number {
  const match = /^([a-z]?)(\d+)$/i.exec(raw.trim());
  const letter = match?.[1]?.toUpperCase();
  const id = Number(match?.[2]);
  if (!match || (letter && letter !== prefix) || !Number.isSafeInteger(id) || id < 1) {
    throw new CliError("USAGE", `"${raw}" is not a ${what} id like ${prefix}12`);
  }
  return id;
}

export const caseId = (raw: string): number => prefixedId(raw, "C", "case");
export const runId = (raw: string): number => prefixedId(raw, "R", "run");
export const testId = (raw: string): number => prefixedId(raw, "T", "test");
export const projectId = (raw: string): number => prefixedId(raw, "P", "project");
export const suiteId = (raw: string): number => prefixedId(raw, "S", "suite");

/** Upper limit for --limit on list commands. */
export const MAX_LIST = 1000;

export function listLimit(raw: string): number {
  return intInRange(raw, "--limit", 1, MAX_LIST);
}
