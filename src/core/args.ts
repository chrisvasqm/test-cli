import { InputError } from "./errors.js";
import { MAX_LIST } from "./paging.js";
import { splitList, uniqueRefs } from "./text.js";

/** Whole number between min and max (inclusive), written as plain digits. */
export function intInRange(raw: string, flag: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const value = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  if (Number.isSafeInteger(value) && value >= min && value <= max) return value;
  const range = max === Number.MAX_SAFE_INTEGER ? `of at least ${min}` : `from ${min} to ${max}`;
  throw new InputError("USAGE", `${flag} must be a whole number ${range}`);
}

/** A calendar date "2026-11-30" → Unix seconds at local midnight, as TestRail stores dates. */
export function dateArg(raw: string, flag: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  const [year, month, day] = [Number(match?.[1]), Number(match?.[2]), Number(match?.[3])];
  const date = new Date(year, month - 1, day);
  // Date rolls 2026-02-30 over to March, so the parts must survive the round trip.
  if (!match || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new InputError("USAGE", `${flag} must be a date like 2026-11-30`);
  }
  return Math.floor(date.getTime() / 1000);
}

export function listLimit(raw: string): number {
  return intInRange(raw, "--limit", 1, MAX_LIST);
}

/** A Jira key such as KAN-12, upper case. */
export const isJiraKey = (text: string): boolean => /^[A-Z][A-Z0-9_]*-[1-9]\d*$/.test(text);

/** "KAN-1 KAN-2" or "KAN-1,KAN-2" → ["KAN-1", "KAN-2"], upper-cased, duplicates dropped. */
export function jiraKeys(raw: readonly string[]): string[] {
  const keys = raw.flatMap((part) => splitList(part)).map((key) => key.toUpperCase());
  const bad = keys.filter((key) => !isJiraKey(key));
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

/** "2026-10-01" (local midnight) or an ISO time with Z or an offset → Unix seconds, for TestRail's *_after filters. */
export function sinceDate(raw: string, flag: string): number {
  const typed = raw.trim();
  if (!typed.includes("T")) return dateArg(typed, flag);
  // A time without Z or an offset would silently use this machine's zone.
  const ms = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(typed) ? Date.parse(typed) : Number.NaN;
  if (Number.isNaN(ms)) {
    throw new InputError("USAGE", `${flag} must be a date like 2026-10-01 or a time like 2026-10-01T10:00Z`);
  }
  return Math.floor(ms / 1000);
}

/** `--name` given and not blank, for commands where commander cannot require it (it depends on other flags). */
export function requireName(name: string | undefined, what: string): asserts name is string {
  if (!name?.trim()) throw new InputError("USAGE", `Give the ${what} a name with --name`);
}
