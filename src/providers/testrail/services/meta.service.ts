import type { HttpClient } from "../http.js";
import { sameName, splitList } from "../../../core/text.js";
import { findByName } from "../lookup.js";
import type { Named, Status, Template } from "../types.js";
import type { Meta } from "../../provider.js";

/** Lookup tables (statuses, priorities, case types, templates). Statuses are fetched once per command. */
export class MetaService implements Meta {
  private statusList: Promise<Status[]> | undefined;

  constructor(private readonly http: HttpClient) {}

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
