import type { Command } from "commander";
import { provider, supported } from "../../providers/index.js";
import { projectId } from "../../providers/testrail/ids.js";
import { listLimit } from "../../core/args.js";
import { emptyPage } from "../../core/paging.js";
import { bootstrap } from "../../core/bootstrap.js";
import { grid, moreHint, printResult, table } from "../../core/output.js";
import { SUITE_MODE_SINGLE, type Milestone, type Plan } from "../../providers/testrail/types.js";
import { isoTime, localDate, passRate, progress, renderProgress, toRunSummary } from "../render.js";
import { toPlanSummary } from "../plan/render.js";

interface ViewOptions {
  limit: string;
}

type MilestoneRow = ReturnType<typeof toMilestoneRow>;

function toMilestoneRow(item: Milestone, now: number) {
  return {
    id: item.id,
    name: item.name,
    parentId: item.parent_id,
    due: isoTime(item.due_on),
    overdue: item.due_on !== null && item.due_on < now,
    started: item.is_started,
    url: item.url,
  };
}

/** Open milestones, each followed by its open sub-milestones. */
function openMilestones(items: Milestone[]): MilestoneRow[] {
  const now = Date.now() / 1000;
  return items.flatMap((item) => [
    toMilestoneRow(item, now),
    ...(item.milestones ?? []).filter((sub) => !sub.is_completed).map((sub) => toMilestoneRow(sub, now)),
  ]);
}

/** Counts per status label, summed over runs and plans. */
function sumCounts(lists: ReadonlyArray<{ counts: Record<string, number> }>): Record<string, number> {
  const sum: Record<string, number> = {};
  for (const item of lists) {
    for (const [label, count] of Object.entries(item.counts)) sum[label] = (sum[label] ?? 0) + count;
  }
  return sum;
}

export function registerView(project: Command): void {
  project
    .command("view [project]")
    .description("Overview of a project (default: yours): open runs and plans with progress, open milestones")
    .option("-n, --limit <n>", "Most open runs, plans and milestones to show (each)", "25")
    .action(async (rawProject: string | undefined, opts: ViewOptions, cmd: Command) => {
      const wanted = rawProject === undefined ? undefined : projectId(rawProject);
      const limit = listLimit(opts.limit);
      const { config, mode } = bootstrap(cmd);
      const id = wanted ?? config.projectId;
      const current = provider();
      // Plans and milestones are optional features; a provider without them shows none.
      const [found, runList, planList, milestoneList, statuses] = await Promise.all([
        current.projects.get(id),
        current.runs.list(id, limit, { completed: false }),
        supported(current, "plans")?.list(id, false, limit) ?? emptyPage<Plan>(),
        supported(current, "milestones")?.list(id, false, limit) ?? emptyPage<Milestone>(),
        current.meta.statuses(),
      ]);
      const runs = runList.items.map((item) => ({
        ...toRunSummary(item, statuses),
        ...progress(item),
        milestoneId: item.milestone_id,
        created: isoTime(item.created_on),
      }));
      const plans = planList.items.map((item) => ({ ...toPlanSummary(item, statuses), ...progress(item) }));
      const active = [...runs, ...plans];
      const total = active.reduce((sum, item) => sum + item.total, 0);
      const passed = active.reduce((sum, item) => sum + item.passed, 0);
      const data = {
        project: {
          id: found.id,
          name: found.name,
          multiSuite: found.suite_mode !== SUITE_MODE_SINGLE,
          current: found.id === config.projectId,
          announcement: found.announcement?.trim() || null,
          showAnnouncement: found.show_announcement,
          url: found.url,
        },
        totals: {
          runs: runs.length,
          plans: plans.length,
          counts: sumCounts(active),
          total,
          passed,
          passRate: passRate(passed, total),
        },
        runs,
        plans,
        milestones: openMilestones(milestoneList.items),
        hasMore: { runs: runList.hasMore, plans: planList.hasMore, milestones: milestoneList.hasMore },
      };
      printResult(mode, data, () => renderOverview(data));
    });
}

/** "1 run", "2 plans". */
const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

function renderOverview(data: {
  project: { id: number; name: string; multiSuite: boolean; announcement: string | null; url: string };
  totals: { runs: number; plans: number; counts: Record<string, number>; passRate: number | null };
  runs: ReadonlyArray<{ id: number; name: string; counts: Record<string, number>; passRate: number | null }>;
  plans: ReadonlyArray<{ id: number; name: string; counts: Record<string, number>; passRate: number | null }>;
  milestones: MilestoneRow[];
  hasMore: { runs: boolean; plans: boolean; milestones: boolean };
}): string {
  const { project, totals, hasMore } = data;
  const rows: [string, string][] = [
    ["Project", `${project.name} (P${project.id})`],
    ["Suites", project.multiSuite ? "multiple" : "single"],
  ];
  if (project.announcement) rows.push(["Announcement", project.announcement]);
  rows.push(["URL", project.url]);

  const work = [
    ...data.runs.map((item) => [`R${item.id}`, item.name, "run", renderProgress(item.counts, item.passRate)]),
    ...data.plans.map((item) => [
      `R${item.id}`,
      item.name,
      "plan",
      renderProgress(item.counts, item.passRate),
    ]),
  ];
  const workText =
    work.length === 0
      ? "No open runs or plans."
      : `${grid(work)}\n\nTotal  ${plural(totals.runs, "run")}, ${plural(totals.plans, "plan")} · ` +
        renderProgress(totals.counts, totals.passRate) +
        moreHint(work.length, hasMore.runs || hasMore.plans);

  const milestones = data.milestones.map((item) => [
    `${item.parentId === null ? "" : "  "}M${item.id}`,
    item.name,
    `due ${localDate(item.due)}${item.overdue ? " · overdue" : ""}`,
  ]);
  const milestoneText =
    milestones.length === 0
      ? "No open milestones."
      : grid(milestones) + moreHint(data.milestones.length, hasMore.milestones);

  return [table(rows), `Open runs and plans\n\n${workText}`, `Open milestones\n\n${milestoneText}`].join(
    "\n\n",
  );
}
