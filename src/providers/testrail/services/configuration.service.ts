import { notFound } from "../errors.js";
import { HttpClient } from "../http.js";
import type { ConfigGroup } from "../types.js";

/** get_configs endpoint: configuration groups (e.g. Browsers, OS) and their configurations. */
export class ConfigurationService {
  constructor(private readonly http = HttpClient.get()) {}

  groups(projectId: number): Promise<ConfigGroup[]> {
    return this.http.get<ConfigGroup[]>(`get_configs/${projectId}`).catch(notFound.project(projectId));
  }
}
