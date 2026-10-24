import { CliError } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { sameName } from "../core/text.js";
import type { Named, Status } from "../core/testrail-types.js";

/** Lookup tables (statuses, priorities, case types), fetched once per command. */
export class MetaService {
  private statusList: Promise<Status[]> | undefined;
  private priorityList: Promise<Named[]> | undefined;
  private typeList: Promise<Named[]> | undefined;

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
