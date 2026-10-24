import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { runId } from "../../providers/testrail/ids.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, table } from "../../core/output.js";
import { splitList } from "../../core/text.js";
import { isoTime, localTime, renderCounts, toRunSummary } from "../render.js";

export function registerView(run: Command): void {
  run
    .command("view <run>")
    .description("Show a run's progress and details, e.g. R3 (its tests: test list R3)")
    .action(async (rawId: string, _opts: unknown, cmd: Command) => {
      const id = runId(rawId);
      const { mode } = bootstrap(cmd);
      const [found, statuses] = await Promise.all([provider().runs.get(id), provider().meta.statuses()]);
      const view = {
        ...toRunSummary(found, statuses),
        description: found.description,
        suiteId: found.suite_id,
        planId: found.plan_id,
        includeAll: found.include_all,
        refs: splitList(found.refs),
        created: isoTime(found.created_on),
      };
      printResult(mode, view, () => {
        const rows: [string, string][] = [
          ["State", view.completed ? `closed ${localTime(view.completedOn)}` : "open"],
          ["Tests", renderCounts(view.counts)],
        ];
        if (view.planId !== null) rows.push(["Plan", `#${view.planId}`]);
        if (view.refs.length > 0) rows.push(["Refs", view.refs.join(", ")]);
        rows.push(["Created", localTime(view.created)], ["URL", view.url]);
        const sections = [`R${view.id}  ${view.name}`, table(rows)];
        if (view.description) sections.push(`Description\n\n${view.description}`);
        return sections.join("\n\n");
      });
    });
}
