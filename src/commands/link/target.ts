import type { Config } from "../../core/config.js";
import { kindedId } from "../../providers/testrail/ids.js";
import { sameKey } from "../../core/text.js";
import type { LinkTarget } from "../../providers/types.js";
import { caseUrl, runUrl, testUrl } from "../render.js";

/** "C12", "R3" or "T45"; the letter is required here, since it picks what gets linked. */
export const linkTarget = (raw: string): LinkTarget => kindedId(raw);

export function targetName(target: LinkTarget): string {
  return `${target.kind[0]!.toUpperCase()}${target.id}`;
}

export function targetUrl(config: Config, target: LinkTarget): string {
  const url = { case: caseUrl, run: runUrl, test: testUrl }[target.kind];
  return url(config, target.id);
}

/** Splits `keys` into those already in `linked` and the rest. */
export function partition(keys: readonly string[], linked: readonly string[]) {
  const isLinked = (key: string) => linked.some((other) => sameKey(other, key));
  return { linked: keys.filter(isLinked), unlinked: keys.filter((key) => !isLinked(key)) };
}

export function renderKeys(name: string, keys: readonly string[]): string {
  return keys.length === 0 ? `${name} has no Jira links.` : `${name} links: ${keys.join(", ")}`;
}
