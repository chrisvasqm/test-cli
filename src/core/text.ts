const collator = new Intl.Collator(undefined, { sensitivity: "accent" });

/** Names typed by people match TestRail's ignoring case: "failed" matches "Failed". */
export function sameName(name: string | undefined, typed: string): boolean {
  return name !== undefined && collator.compare(name, typed) === 0;
}

/** "KAN-1, KAN-2" (TestRail's refs and defects fields) as a list. */
export function splitRefs(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((ref) => ref.trim())
    .filter(Boolean);
}
