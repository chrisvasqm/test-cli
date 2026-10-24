import { CliError } from "./errors.js";
import { HttpClient, type Params } from "./http.js";

/** TestRail's largest (and default) page for bulk GETs. */
export const PAGE_SIZE = 250;

/** Bulk GETs return `{offset, limit, size, _links: {next}, <key>: [...]}`; older servers return a bare array. */
type BulkResponse = Record<string, unknown> & { _links?: { next?: string | null } };

export interface Collected<T> {
  items: T[];
  hasMore: boolean;
}

/** Follow `_links.next` until `limit` items or the last page. */
export async function collectPages<T>(
  endpoint: string,
  key: string,
  params: Params,
  limit: number,
  http = HttpClient.get(),
): Promise<Collected<T>> {
  const items: T[] = [];
  let next: string | null | undefined;
  let page: T[] = [];
  let response = await http.get<BulkResponse | T[] | undefined>(endpoint, {
    ...params,
    limit: Math.min(PAGE_SIZE, limit),
  });
  for (;;) {
    // A 2xx with an empty body decodes to undefined.
    if (response === undefined) throw new CliError("INVALID_RESPONSE", `${endpoint} returned no data.`);
    page = Array.isArray(response) ? response : ((response[key] ?? []) as T[]);
    items.push(...page);
    next = Array.isArray(response) ? null : response._links?.next;
    if (!next || page.length === 0 || items.length >= limit) break;
    response = await http.getLink<BulkResponse | undefined>(next);
  }
  // An empty page ends the walk even when TestRail still sends a next link.
  return {
    items: items.slice(0, limit),
    hasMore: items.length > limit || (Boolean(next) && page.length > 0),
  };
}
