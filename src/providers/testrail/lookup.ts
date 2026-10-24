import { InputError } from "../../core/errors.js";
import { sameName, splitList } from "../../core/text.js";
import type { Config, ConfigGroup, Named } from "./types.js";

/** Pure lookups over TestRail's tables (statuses, priorities, case types, configurations). */

/** Case type or priority id by name ("functional", "High"); `what` names it in the error. */
export function idByName(items: Named[], typed: string, code: string, what: string): number {
  return findByName(items, typed, (item) => sameName(item.name, typed.trim()), code, what).id;
}

/** "High,Critical" → ids, each looked up as idByName does. */
export function idsByName(items: Named[], typed: string, code: string, what: string): number[] {
  const names = splitList(typed);
  if (names.length === 0) throw new InputError("USAGE", `Give at least one ${what} name`);
  return names.map((name) => idByName(items, name, code, what));
}

export function findByName<T extends { name: string; label?: string }>(
  items: T[],
  typed: string,
  matches: (item: T) => boolean,
  code: string,
  what: string,
): T {
  const found = items.find(matches);
  if (found) return found;
  throw new InputError(
    code,
    `No ${what} named "${typed}"`,
    items.map((item) => item.label ?? item.name),
  );
}

/** Name for an id from a lookup table, or "#id" when TestRail did not list it. */
export function nameOf(
  items: ReadonlyArray<{ id: number; name?: string; label?: string }>,
  id: number | null,
) {
  if (id === null) return null;
  const item = items.find((entry) => entry.id === id);
  return item?.label ?? item?.name ?? `#${id}`;
}

/**
 * Configuration ids for names or ids typed comma-separated. Names match ignoring case and must be
 * unique across groups; an unknown or ambiguous one is a CONFIG_NOT_FOUND usage error.
 */
export function configIds(groups: ConfigGroup[], typed: string): number[] {
  const all = groups.flatMap((group) => group.configs);
  const parts = splitList(typed);
  if (parts.length === 0) throw new InputError("USAGE", "Name at least one configuration.");
  return parts.map((part) => findConfig(all, groups, part).id);
}

function findConfig(all: Config[], groups: ConfigGroup[], typed: string): Config {
  const matches = /^\d+$/.test(typed)
    ? all.filter((item) => item.id === Number(typed))
    : all.filter((item) => sameName(item.name, typed));
  if (matches.length === 1) return matches[0]!;
  const message =
    matches.length === 0
      ? `No configuration named "${typed}"`
      : `"${typed}" names a configuration in several groups; use its id`;
  throw new InputError("CONFIG_NOT_FOUND", message, configList(groups));
}

/** "Browsers: 3  Chrome" lines, for error details. */
function configList(groups: ConfigGroup[]): string[] {
  return groups.flatMap((group) => group.configs.map((item) => `${group.name}: ${item.id}  ${item.name}`));
}

/**
 * One configuration id list per run: the product across groups of the chosen ids, as TestRail's
 * plan dialog makes them. Chrome, Firefox and Windows give Chrome+Windows and Firefox+Windows.
 */
export function configCombinations(groups: ConfigGroup[], ids: readonly number[]): number[][] {
  const picked = groups
    .map((group) => group.configs.filter((item) => ids.includes(item.id)).map((item) => item.id))
    .filter((options) => options.length > 0);
  return picked.reduce<number[][]>(
    (combos, options) => combos.flatMap((combo) => options.map((option) => [...combo, option])),
    [[]],
  );
}
