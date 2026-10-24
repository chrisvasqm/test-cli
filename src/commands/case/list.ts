import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { intInRange, jiraKey, listLimit, sinceDate } from "../../core/args.js";
import { InputError } from "../../core/errors.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, renderList } from "../../core/output.js";
import { splitList } from "../../core/text.js";
import type { Collected } from "../../core/paging.js";
import type { Case } from "../../providers/testrail/types.js";
import type { CaseFilter } from "../../providers/types.js";
import { idsByName, nameOf } from "../../providers/testrail/lookup.js";
import { isoTime } from "../render.js";

interface ListOptions {
  section?: string;
  refs?: string;
  query?: string;
  priority?: string;
  type?: string;
  updatedSince?: string;
  limit: string;
}

export function registerList(testCase: Command): void {
  testCase
    .command("list")
    .description("List the cases in the project (and suite) from the config")
    .option("-sc, --section <id>", "Only cases in this section")
    .option("-r, --refs <key>", "Only cases linked to this Jira key, e.g. KAN-12")
    .option("-q, --query <text>", "Only cases whose title contains this text")
    .option("-p, --priority <names>", "Only these priorities, comma-separated, e.g. High,Critical")
    .option("-ty, --type <names>", "Only these case types, comma-separated, e.g. Functional,Regression")
    .option(
      "-u, --updated-since <date>",
      "Only cases updated on or after this date (local midnight), e.g. 2026-10-01",
    )
    .option("-n, --limit <n>", "Most cases to show", "50")
    .action(async (opts: ListOptions, cmd: Command) => {
      const limit = listLimit(opts.limit);
      const sectionId = opts.section === undefined ? undefined : intInRange(opts.section, "--section", 1);
      const key = opts.refs === undefined ? undefined : jiraKey(opts.refs, "--refs");
      const query = opts.query?.trim();
      if (query === "") throw new InputError("USAGE", "--query cannot be empty");
      const updatedAfter =
        opts.updatedSince === undefined ? undefined : sinceDate(opts.updatedSince, "--updated-since");
      const { config, mode } = bootstrap(cmd);
      const { meta } = provider();
      // The same tables name each row's priority and type; filter names need them before listing.
      const tablesLoaded = Promise.all([meta.priorities(), meta.caseTypes()]);
      const filtered = opts.priority !== undefined || opts.type !== undefined;
      const [filterPriorities, filterTypes] = filtered ? await tablesLoaded : [];
      const priorityIds =
        opts.priority === undefined || filterPriorities === undefined
          ? undefined
          : idsByName(filterPriorities, opts.priority, "UNKNOWN_PRIORITY", "priority");
      const typeIds =
        opts.type === undefined || filterTypes === undefined
          ? undefined
          : idsByName(filterTypes, opts.type, "UNKNOWN_TYPE", "case type");
      const listed = listCases(
        {
          projectId: config.projectId,
          suiteId: config.suiteId,
          sectionId,
          query,
          priorityIds,
          typeIds,
          updatedAfter,
          limit,
        },
        key,
      );
      const [[priorities, types], { items, hasMore }] = await Promise.all([tablesLoaded, listed]);
      const cases = items.map((item) => ({
        id: item.id,
        title: item.title,
        sectionId: item.section_id,
        priority: nameOf(priorities, item.priority_id),
        type: nameOf(types, item.type_id),
        refs: splitList(item.refs),
        updated: isoTime(item.updated_on),
      }));
      printResult(mode, { cases, hasMore }, () =>
        renderList(
          cases.map((item) => [
            `C${item.id}`,
            item.priority ?? "",
            item.type ?? "",
            item.title,
            item.refs.join(", "),
          ]),
          "No cases.",
          hasMore,
        ),
      );
    });
}

/** With a key, every exact match is fetched first, so the limit cuts the matches, not TestRail's looser page. */
async function listCases(filter: CaseFilter, key: string | undefined): Promise<Collected<Case>> {
  const { cases } = provider();
  if (key === undefined) return cases.list(filter);
  const matches = await cases.withRef(filter, key);
  return { items: matches.slice(0, filter.limit), hasMore: matches.length > filter.limit };
}
