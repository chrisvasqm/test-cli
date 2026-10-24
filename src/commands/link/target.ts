import type { Config } from "../../core/config.js";
import { InputError } from "../../core/errors.js";
import { sameKey, splitList, uniqueRefs } from "../../core/text.js";
import type { LinkTarget } from "../../services/link.service.js";
import { caseUrl, runUrl, testUrl } from "../render.js";

/** By id letter: C, R, T. */
const KINDS = ["case", "run", "test"] as const;

/** "C12", "R3" or "T45"; the letter is required here, since it picks what gets linked. */
export function linkTarget(raw: string): LinkTarget {
  const match = /^([crt])(\d+)$/i.exec(raw.trim());
  const id = Number(match?.[2]);
  if (!match || !Number.isSafeInteger(id) || id < 1) {
    throw new InputError("USAGE", `"${raw}" is not a case, run or test id like C12, R3 or T45`);
  }
  return { kind: KINDS["CRT".indexOf(match[1]!.toUpperCase())]!, id };
}

export function targetName(target: LinkTarget): string {
  return `${target.kind[0]!.toUpperCase()}${target.id}`;
}

export function targetUrl(config: Config, target: LinkTarget): string {
  const url = { case: caseUrl, run: runUrl, test: testUrl }[target.kind];
  return url(config, target.id);
}

/** "KAN-1 KAN-2" or "KAN-1,KAN-2" → ["KAN-1", "KAN-2"], upper-cased, duplicates dropped. */
export function jiraKeys(raw: readonly string[]): string[] {
  const keys = raw.flatMap((part) => splitList(part)).map((key) => key.toUpperCase());
  const bad = keys.filter((key) => !/^[A-Z][A-Z0-9_]*-[1-9]\d*$/.test(key));
  if (bad.length > 0) throw new InputError("USAGE", `Not a Jira key like KAN-12: ${bad.join(", ")}`);
  if (keys.length === 0) throw new InputError("USAGE", "Give at least one Jira key, e.g. KAN-12");
  return uniqueRefs(keys);
}

/** One Jira key, for --from-jira. */
export function jiraKey(raw: string, flag: string): string {
  const keys = jiraKeys([raw]);
  if (keys.length > 1) throw new InputError("USAGE", `${flag} takes one Jira key, e.g. KAN-12`);
  return keys[0]!;
}

/** Splits `keys` into those already in `linked` and the rest. */
export function partition(keys: readonly string[], linked: readonly string[]) {
  const isLinked = (key: string) => linked.some((other) => sameKey(other, key));
  return { linked: keys.filter(isLinked), unlinked: keys.filter((key) => !isLinked(key)) };
}

export function renderKeys(name: string, keys: readonly string[]): string {
  return keys.length === 0 ? `${name} has no Jira links.` : `${name} links: ${keys.join(", ")}`;
}
