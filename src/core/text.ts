const collator = new Intl.Collator(undefined, { sensitivity: "accent" });

/** Names typed by people match TestRail's ignoring case: "failed" matches "Failed". */
export function sameName(name: string | undefined, typed: string): boolean {
  return name !== undefined && collator.compare(name, typed) === 0;
}

/** "KAN-1, KAN-2" (refs, defects, ids, status names) as a list, blanks dropped. */
export function splitList(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Keys compare ignoring case, as Jira does. */
export function sameKey(left: string, right: string): boolean {
  return left.toUpperCase() === right.toUpperCase();
}

/** Whether comma-separated `refs` hold `key` exactly, ignoring case. */
export function hasRef(refs: string | null | undefined, key: string): boolean {
  return splitList(refs).some((ref) => sameKey(ref, key));
}

/** Longest TestRail run name or case title. */
export const MAX_NAME = 250;
/** Longest Jira summary. */
export const MAX_SUMMARY = 255;

/** Text cut to `max` characters, ending in "…" when cut (TestRail names and titles hold 250). */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  // Counted in UTF-16 units, as Jira (Java) counts; a cut emoji loses its lone high surrogate.
  return `${text
    .slice(0, max - 1)
    .replace(/[\uD800-\uDBFF]$/, "")
    .trimEnd()}…`;
}

/** Keys without repeats, compared ignoring case; the first spelling wins. */
export function uniqueRefs(refs: readonly string[]): string[] {
  const seen = new Set<string>();
  return refs.filter((ref) => !seen.has(ref.toUpperCase()) && seen.add(ref.toUpperCase()));
}

/** Longest refs field TestRail takes ("Field :refs is too long (250 characters at most)."). */
export const MAX_REFS = 250;

/** `extra` keys added after `refs` while the joined field stays within MAX_REFS; returns the extras left out. */
export function fitRefs(
  refs: readonly string[],
  extra: readonly string[],
): { refs: string[]; left: string[] } {
  const kept = uniqueRefs(refs);
  const left: string[] = [];
  for (const key of uniqueRefs(extra)) {
    if (kept.some((ref) => sameKey(ref, key))) continue;
    if (joinRefs([...kept, key]).length <= MAX_REFS) kept.push(key);
    else left.push(key);
  }
  return { refs: kept, left };
}

/** Refs or defects as TestRail stores them: "KAN-1,KAN-2". */
export function joinRefs(refs: string | readonly string[] | undefined): string {
  return (typeof refs === "string" || refs === undefined ? splitList(refs) : refs).join(",");
}
