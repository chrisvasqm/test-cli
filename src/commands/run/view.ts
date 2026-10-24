import type { Command } from "commander";
import { runId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, table } from "../../core/output.js";
import { splitRefs } from "../../core/text.js";
import { MetaService } from "../../services/meta.service.js";
import { RunService } from "../../services/run.service.js";
import { isoTime, localTime, renderCounts, runCounts } from "../render.js";

export function registerView(run: Command): void {
  run
    .command("view <run>")
    .description("Show a run's progress and details, e.g. R3 (its tests: test list R3)")
    .action(async (rawId: string, _opts: unknown, cmd: Command) => {
      const id = runId(rawId);
      const { mode } = bootstrap(cmd);
      const [found, statuses] = await Promise.all([new RunService().get(id), new MetaService().statuses()]);
      const view = {
        id: found.id,
        name: found.name,
        url: found.url,
        description: found.description,
        suiteId: found.suite_id,
        planId: found.plan_id,
        includeAll: found.include_all,
        completed: found.is_completed,
        completedOn: isoTime(found.completed_on),
        refs: splitRefs(found.refs),
        counts: runCounts(found, statuses),
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
