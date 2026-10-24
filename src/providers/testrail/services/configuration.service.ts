import { notFound } from "../errors.js";
import type { HttpClient } from "../http.js";
import type { ConfigGroup } from "../types.js";
import type { Configurations } from "../../provider.js";

/** get_configs endpoint: configuration groups (e.g. Browsers, OS) and their configurations. */
export class ConfigurationService implements Configurations {
  constructor(private readonly http: HttpClient) {}

  groups(projectId: number): Promise<ConfigGroup[]> {
    return this.http.get<ConfigGroup[]>(`get_configs/${projectId}`).catch(notFound.project(projectId));
  }
}
