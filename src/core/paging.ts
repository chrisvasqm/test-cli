/** The `limit` that reads every page, for sweeps that must see everything (e.g. matching refs). */
export const ALL = Number.MAX_SAFE_INTEGER;

/** Most items one list reads: the --limit ceiling, and the cap for lists of projects, suites and users. */
export const MAX_LIST = 1000;

export interface Collected<T> {
  items: T[];
  hasMore: boolean;
}

/** How many requests one command sends at once, so a long list of ids stays under the rate limit. */
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
