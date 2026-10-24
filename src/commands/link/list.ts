import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { idOrJiraKey } from "../../providers/testrail/ids.js";
import { bootstrap } from "../../core/bootstrap.js";
import type { Config } from "../../core/config.js";
import { printResult, renderList, type OutputMode } from "../../core/output.js";
import { caseUrl, runUrl } from "../render.js";
import { renderKeys, targetName, targetUrl } from "./target.js";

export function registerList(link: Command): void {
  link
    .command("list <target>")
    .description(
      "Show the Jira keys linked to a case, run or test (e.g. C12), or the cases and runs (not in plans) linked to a Jira key (e.g. KAN-12)",
    )
    .action(async (rawTarget: string, _opts: unknown, cmd: Command) => {
      const target = idOrJiraKey(rawTarget);
      const { config, mode } = bootstrap(cmd);
      if (target.kind === "key") {
        await listForKey(config, mode, target.key);
        return;
      }
      const { keys } = await provider().links.load(target);
      const view = { target: targetName(target), keys, url: targetUrl(config, target) };
      printResult(mode, view, () => `${renderKeys(view.target, keys)}\n${view.url}`);
    });
}

/** The cases (in the configured suite) and runs (open or closed, not in plans) whose refs hold `key`. */
async function listForKey(config: Config, mode: OutputMode, key: string): Promise<void> {
  const [cases, runs] = await Promise.all([
    provider().cases.withRef(
      { projectId: config.projectId, suiteId: config.suiteId, sectionId: undefined },
      key,
    ),
    provider().runs.withRef(config.projectId, config.suiteId, key),
  ]);
  const view = {
    target: key,
    cases: cases.map((item) => ({ id: item.id, title: item.title, url: caseUrl(config, item.id) })),
    runs: runs.map((item) => ({
      id: item.id,
      name: item.name,
      completed: item.is_completed,
      url: runUrl(config, item.id),
    })),
  };
  printResult(mode, view, () =>
    renderList(
      [
        ...view.cases.map((item) => [`C${item.id}`, "case", item.title, item.url]),
        ...view.runs.map((item) => [
          `R${item.id}`,
          item.completed ? "run (closed)" : "run",
          item.name,
          item.url,
        ]),
      ],
      `No cases or runs link ${key}.`,
      false,
    ),
  );
}
