import { InputError } from "../../core/errors.js";
import { jiraKey } from "../../core/args.js";
import { splitList } from "../../core/text.js";

/**
 * TestRail shows ids with a letter: C12 (case), R3 (run), T45 (test), P2 (project), S1 (suite),
 * M3 (milestone). Test plans share the run ids and show as R ids too (R7).
 */
const ID_KINDS = {
  case: "C",
  run: "R",
  test: "T",
  project: "P",
  suite: "S",
  milestone: "M",
  plan: "R",
} as const;

type IdKind = keyof typeof ID_KINDS;

/**
 * Accepts "C12", "c12" or "12" for that kind; another letter is a usage error. `where` prefixes the
 * error, e.g. "entry 3".
 */
function prefixedId(kind: IdKind, raw: string, where?: string): number {
  const prefix = ID_KINDS[kind];
  const match = /^([a-z]?)(\d+)$/i.exec(raw.trim());
  const letter = match?.[1]?.toUpperCase();
  const id = Number(match?.[2]);
  if (!match || (letter && letter !== prefix) || !Number.isSafeInteger(id) || id < 1) {
    throw new InputError(
      "USAGE",
      `${where ? `${where}: ` : ""}"${raw}" is not a ${kind} id like ${prefix}12`,
    );
  }
  return id;
}

export const caseId = (raw: string, where?: string): number => prefixedId("case", raw, where);
export const runId = (raw: string): number => prefixedId("run", raw);
export const testId = (raw: string): number => prefixedId("test", raw);
export const projectId = (raw: string): number => prefixedId("project", raw);
export const suiteId = (raw: string): number => prefixedId("suite", raw);
export const milestoneId = (raw: string): number => prefixedId("milestone", raw);
export const planId = (raw: string): number => prefixedId("plan", raw);

/** "C1,C2,3" → [1, 2, 3]. */
export function caseIds(raw: string, flag = "--cases"): number[] {
  const ids = splitList(raw).map((part) => caseId(part));
  if (ids.length === 0) throw new InputError("USAGE", `${flag} needs at least one case id, e.g. C1,C2`);
  return ids;
}

/** Case ids given as separate arguments and/or comma-separated ("C1 C2,C3") → [1, 2, 3], duplicates dropped. */
export function caseIdList(raw: readonly string[]): number[] {
  const ids = raw.flatMap((part) => splitList(part)).map((part) => caseId(part));
  if (ids.length === 0) throw new InputError("USAGE", "Give at least one case id, e.g. C1 C2");
  return [...new Set(ids)];
}

/** The kinds `kindedId` tells apart by their letter. */
const KINDED = ["case", "run", "test"] as const satisfies readonly IdKind[];
type Kinded = (typeof KINDED)[number];

/** A case, run or test id; the letter is required, since it says which kind is meant. */
export function kindedId(raw: string): { kind: Kinded; id: number } {
  const kind = kindOf(raw);
  if (kind) return { kind, id: prefixedId(kind, raw) };
  throw new InputError("USAGE", `"${raw}" is not a case, run or test id like C12, R3 or T45`);
}

const kindOf = (raw: string): Kinded | undefined => {
  const letter = raw.trim()[0]?.toUpperCase();
  return KINDED.find((kind) => ID_KINDS[kind] === letter);
};

/** A case, run or test id (C12, R3, T45), or a Jira key (KAN-12): a Jira key has a dash. */
export function idOrJiraKey(raw: string): { kind: Kinded; id: number } | { kind: "key"; key: string } {
  if (!raw.includes("-")) {
    if (kindOf(raw)) return kindedId(raw);
    throw new InputError(
      "USAGE",
      `"${raw}" is not a case, run or test id like C12, R3 or T45, or a Jira key like KAN-12`,
    );
  }
  return { kind: "key", key: jiraKey(raw, "<target>") };
}
