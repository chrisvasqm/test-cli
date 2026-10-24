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

/** Refs or defects as TestRail stores them: "KAN-1,KAN-2". */
export function joinRefs(refs: string | readonly string[] | undefined): string {
  return (typeof refs === "string" || refs === undefined ? splitList(refs) : refs).join(",");
}
