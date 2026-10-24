import { InputError } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { sameName, splitList } from "../core/text.js";
import type { Named, Status, Template } from "../core/testrail-types.js";

/** Lookup tables (statuses, priorities, case types, templates). Statuses are fetched once per command. */
export class MetaService {
  private statusList: Promise<Status[]> | undefined;

  constructor(private readonly http = HttpClient.get()) {}

  statuses(): Promise<Status[]> {
    this.statusList ??= this.http.get<Status[]>("get_statuses");
    return this.statusList;
  }

  priorities(): Promise<Named[]> {
    return this.http.get<Named[]>("get_priorities");
  }

  caseTypes(): Promise<Named[]> {
    return this.http.get<Named[]>("get_case_types");
  }

  templates(projectId: number): Promise<Template[]> {
    return this.http.get<Template[]>(`get_templates/${projectId}`);
  }

  /** One status by its label ("Failed") or system name ("failed"). */
  async status(typed: string): Promise<Status> {
    const statuses = await this.statuses();
    return findByName(
      statuses,
      typed,
      (item) => sameName(item.label, typed.trim()) || sameName(item.name, typed.trim()),
      "UNKNOWN_STATUS",
      "status",
    );
  }

  /** Statuses not yet done (TestRail's To-Do): not is_final, or Untested and Retest on servers without it. */
  async openStatusIds(): Promise<number[]> {
    const statuses = await this.statuses();
    const hasFinal = statuses.some((item) => item.is_final !== undefined);
    const open = hasFinal
      ? statuses.filter((item) => item.is_final === false)
      : statuses.filter((item) => item.is_untested || item.name === "retest");
    return open.map((item) => item.id);
  }

  /** "failed,retest" → status ids. */
  statusIds(typed: string): Promise<number[]> {
    return Promise.all(splitList(typed).map(async (name) => (await this.status(name)).id));
  }
}

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

function findByName<T extends { name: string; label?: string }>(
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
