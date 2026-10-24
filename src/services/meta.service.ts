import { CliError } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { sameName } from "../core/text.js";
import type { Named, Status, Template } from "../core/testrail-types.js";

/** Lookup tables (statuses, priorities, case types, templates), fetched once per command. */
export class MetaService {
  private statusList: Promise<Status[]> | undefined;
  private priorityList: Promise<Named[]> | undefined;
  private typeList: Promise<Named[]> | undefined;
  private templateList: Promise<Template[]> | undefined;

  constructor(private readonly http = HttpClient.get()) {}

  statuses(): Promise<Status[]> {
    this.statusList ??= this.http.get<Status[]>("get_statuses");
    return this.statusList;
  }

  priorities(): Promise<Named[]> {
    this.priorityList ??= this.http.get<Named[]>("get_priorities");
    return this.priorityList;
  }

  caseTypes(): Promise<Named[]> {
    this.typeList ??= this.http.get<Named[]>("get_case_types");
    return this.typeList;
  }

  templates(projectId: number): Promise<Template[]> {
    this.templateList ??= this.http.get<Template[]>(`get_templates/${projectId}`);
    return this.templateList;
  }

  /** Case type or priority id by name ("functional", "High"); `what` names it in the error. */
  async idByName(items: Promise<Named[]>, typed: string, code: string, what: string): Promise<number> {
    const list = await items;
    const found = list.find((item) => sameName(item.name, typed.trim()));
    if (!found)
      throw new CliError(
        code,
        `No ${what} named "${typed}"`,
        list.map((item) => item.name),
      );
    return found.id;
  }

  /** "failed,retest" → status ids; matches the label ("Failed") or system name ("failed"). */
  async statusIds(typed: string): Promise<number[]> {
    const statuses = await this.statuses();
    return typed
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => {
        const found = statuses.find((item) => sameName(item.label, name) || sameName(item.name, name));
        if (!found) {
          throw new CliError(
            "UNKNOWN_STATUS",
            `No status named "${name}"`,
            statuses.map((item) => item.label),
          );
        }
        return found.id;
      });
  }
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
