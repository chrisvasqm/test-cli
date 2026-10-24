import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { milestoneId } from "../../providers/testrail/ids.js";
import { listLimit } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { grid, moreHint, printResult } from "../../core/output.js";
import { nameOf } from "../../providers/testrail/lookup.js";
import type { OpenRun } from "../../providers/testrail/services/run.service.js";
import { assigneeView } from "../render.js";

interface TodoOptions {
  status?: string;
  assigned?: string;
  milestone?: string;
  limit: string;
}

/** The run's name, its plan and its configuration as `--json` shows them. */
function runView({ run, plan }: OpenRun) {
  return {
    runId: run.id,
    runName: run.name,
    planId: plan?.id ?? null,
    planName: plan?.name ?? null,
    config: "config" in run ? run.config : null,
  };
}

type TodoView = ReturnType<typeof runView> & {
  id: number;
  caseId: number;
  title: string;
  status: string | null;
};

/** One heading per run ("R12  Login (plan R7, Chrome)"), its tests indented below it. */
function renderByRun(tests: TodoView[]): string {
  const groups = new Map<number, TodoView[]>();
  for (const item of tests) groups.set(item.runId, [...(groups.get(item.runId) ?? []), item]);
  return [...groups.values()]
    .map((group) => {
      const { runId, runName, planId, config } = group[0]!;
      const where = [planId === null ? "" : `plan R${planId}`, config ?? ""].filter(Boolean).join(", ");
      const heading = `R${runId}  ${runName}${where ? ` (${where})` : ""}`;
      const rows = grid(
        group.map((item) => [`T${item.id}`, `C${item.caseId}`, item.status ?? "", item.title]),
      );
      return `${heading}\n${rows.replace(/^/gm, "  ")}`;
    })
    .join("\n\n");
}

export function registerTodo(test: Command): void {
  test
    .command("todo")
    .description("Tests assigned to you that are not done, across open runs and plans, newest run first")
    .option("-a, --assigned <user>", "Whose tests: me (default), an email or a user id")
    .option(
      "-s, --status <names>",
      "Only these statuses, comma-separated (default: those not final, e.g. untested,retest)",
    )
    .option("-ml, --milestone <id>", "Only runs and plans in this milestone, e.g. M3")
    .option("-n, --limit <n>", "Most tests to show", "100")
    .action(async (opts: TodoOptions, cmd: Command) => {
      const limit = listLimit(opts.limit);
      const milestone = opts.milestone === undefined ? undefined : milestoneId(opts.milestone);
      const { config, mode } = bootstrap(cmd);
      const { meta } = provider();
      // Read before any request starts, so a provider without milestones fails cleanly.
      const milestones = milestone === undefined ? undefined : provider().milestones;
      const [user, statusIds, runs] = await Promise.all([
        provider().users.resolve(opts.assigned ?? "me", config.email, "--assigned"),
        opts.status === undefined ? meta.openStatusIds() : meta.statusIds(opts.status),
        provider().runs.allOpen(config.projectId, milestone),
        milestone === undefined ? undefined : milestones?.get(milestone),
      ]);
      const byRun = new Map(runs.map((item) => [item.run.id, runView(item)]));
      const [found, statuses] = await Promise.all([
        provider().tests.assigned([...byRun.keys()], statusIds, user.id),
        meta.statuses(),
      ]);
      const tests = found.slice(0, limit).map((item) => ({
        id: item.id,
        caseId: item.case_id,
        title: item.title,
        status: nameOf(statuses, item.status_id),
        ...byRun.get(item.run_id)!,
      }));
      const hasMore = found.length > limit;
      printResult(mode, { user: assigneeView(user), tests, hasMore }, () =>
        tests.length === 0 ? "Nothing to do." : renderByRun(tests) + moreHint(tests.length, hasMore),
      );
    });
}
