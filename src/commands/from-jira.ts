import { jiraKey } from "../core/args.js";
import { InputError } from "../core/errors.js";
import { jiraTicket, type JiraTicket } from "../core/jira.js";
import { splitList, uniqueRefs } from "../core/text.js";

/** --from-jira, read before any request; without it, `flag` (--title, --name) is required. */
export function fromJiraKey(
  raw: string | undefined,
  given: string | undefined,
  flag: string,
): string | undefined {
  if (raw !== undefined) return jiraKey(raw, "--from-jira");
  if (given === undefined)
    throw new InputError("USAGE", `Give ${flag}, or --from-jira KAN-12 to take it from Jira`);
  return undefined;
}

/** The ticket, and --refs with its key first (no ticket: --refs as given). */
export async function loadFromJira(
  key: string | undefined,
  refs: string | undefined,
): Promise<{ ticket: JiraTicket | undefined; refs: string[] }> {
  const ticket = key === undefined ? undefined : await jiraTicket(key);
  return { ticket, refs: uniqueRefs([...(ticket ? [ticket.key] : []), ...splitList(refs)]) };
}

/** The `jira` field of a created case or run. */
export const jiraView = (ticket: JiraTicket | undefined) =>
  ticket ? { key: ticket.key, url: ticket.url } : null;
