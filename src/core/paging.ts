import { CliError } from "./errors.js";
import type { HttpClient, Params } from "./http.js";

/** The `limit` that reads every page, for sweeps that must see everything (e.g. matching refs). */
export const ALL = Number.MAX_SAFE_INTEGER;

/** Most items one list reads: the --limit ceiling, and the cap for lists of projects, suites and users. */
export const MAX_LIST = 1000;

/** TestRail's largest (and default) page for bulk GETs. */
const PAGE_SIZE = 250;

/** Bulk GETs return `{offset, limit, size, _links: {next}, <key>: [...]}`; older servers return a bare array. */
type BulkResponse = Record<string, unknown> & { _links?: { next?: string | null } };

export interface Collected<T> {
  items: T[];
  hasMore: boolean;
}

/** How many GETs one command sends at once, so a long list of ids stays under TestRail's rate limit. */
const BATCH_SIZE = 5;

/** `fn` over `items`, BATCH_SIZE at a time; results keep the order of `items`. */
export async function inBatches<Item, Out>(
  items: readonly Item[],
  fn: (item: Item) => Promise<Out>,
): Promise<Out[]> {
  const out: Out[] = [];
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    out.push(...(await Promise.all(items.slice(start, start + BATCH_SIZE).map(fn))));
  }
  return out;
}

/** Follow `_links.next` until `limit` items or the last page; each page asks only for what is still needed. */
export async function collectPages<T>(
  endpoint: string,
  key: string,
  params: Params,
  limit: number,
  http: HttpClient,
): Promise<Collected<T>> {
  const items: T[] = [];
  let next: string | null | undefined;
  let page: T[] = [];
  let response = await http.get<BulkResponse | T[] | undefined>(endpoint, {
    ...params,
    limit: Math.min(PAGE_SIZE, limit),
  });
  for (;;) {
    ({ page, next } = readPage<T>(endpoint, key, response));
    items.push(...page);
    if (!next || page.length === 0 || items.length >= limit) break;
    const want = Math.min(PAGE_SIZE, limit - items.length);
    response = await http.getLink<BulkResponse | undefined>(next.replace(/&limit=\d+/, `&limit=${want}`));
  }
  // An empty page ends the walk even when TestRail still sends a next link.
  return {
    items: items.slice(0, limit),
    hasMore: items.length > limit || (Boolean(next) && page.length > 0),
  };
}

/** The first item of a bulk GET that `match` accepts; no page is read after the one that has it. */
export async function findInPages<T>(
  endpoint: string,
  key: string,
  params: Params,
  match: (item: T) => boolean,
  http: HttpClient,
): Promise<T | undefined> {
  let response = await http.get<BulkResponse | T[] | undefined>(endpoint, { ...params, limit: PAGE_SIZE });
  for (;;) {
    const { page, next } = readPage<T>(endpoint, key, response);
    const found = page.find(match);
    if (found !== undefined) return found;
    // An empty page ends the walk even when TestRail still sends a next link.
    if (!next || page.length === 0) return undefined;
    response = await http.getLink<BulkResponse | undefined>(next);
  }
}

/** One page's items and its next link (none for a bare array). */
function readPage<T>(
  endpoint: string,
  key: string,
  response: BulkResponse | T[] | undefined,
): { page: T[]; next: string | null | undefined } {
  // A 2xx with an empty body decodes to undefined.
  if (response === undefined) throw new CliError("INVALID_RESPONSE", `${endpoint} returned no data.`);
  if (Array.isArray(response)) return { page: response, next: null };
  return { page: (response[key] ?? []) as T[], next: response._links?.next };
}
