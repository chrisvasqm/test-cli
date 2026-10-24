import { InputError, notFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import type { Config, ConfigGroup } from "../core/testrail-types.js";
import { sameName, splitList } from "../core/text.js";

/** get_configs endpoint: configuration groups (e.g. Browsers, OS) and their configurations. */
export class ConfigurationService {
  constructor(private readonly http = HttpClient.get()) {}

  groups(projectId: number): Promise<ConfigGroup[]> {
    return this.http.get<ConfigGroup[]>(`get_configs/${projectId}`).catch(notFound.project(projectId));
  }
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
