import type { Command } from "commander";
import { jiraKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import type { Config } from "../../core/config.js";
import { printResult, renderList, type OutputMode } from "../../core/output.js";
import { CaseService } from "../../services/case.service.js";
import { LinkService } from "../../services/link.service.js";
import { RunService } from "../../services/run.service.js";
import { caseUrl, runUrl } from "../render.js";
import { linkTarget, renderKeys, targetName, targetUrl } from "./target.js";

export function registerList(link: Command): void {
  link
    .command("list <target>")
    .description(
      "Show the Jira keys linked to a case, run or test (e.g. C12), or the cases and runs linked to a Jira key (e.g. KAN-12)",
    )
    .action(async (rawTarget: string, _opts: unknown, cmd: Command) => {
      // A Jira key has a dash; C12, R3 and T45 do not.
      if (rawTarget.includes("-")) {
        const key = jiraKey(rawTarget, "<target>");
        const { config, mode } = bootstrap(cmd);
        await listForKey(config, mode, key);
        return;
      }
      const target = linkTarget(rawTarget);
      const { config, mode } = bootstrap(cmd);
      const { keys } = await new LinkService().load(target);
      const view = { target: targetName(target), keys, url: targetUrl(config, target) };
      printResult(mode, view, () => `${renderKeys(view.target, keys)}\n${view.url}`);
    });
}

/** The cases (in the configured suite) and runs (open or closed) whose refs hold `key`. */
async function listForKey(config: Config, mode: OutputMode, key: string): Promise<void> {
  const [cases, runs] = await Promise.all([
    new CaseService().withRef(
      { projectId: config.projectId, suiteId: config.suiteId, sectionId: undefined },
      key,
    ),
    new RunService().withRef(config.projectId, key),
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
        ...view.cases.map((item) => [`C${item.id}`, "case", item.title]),
        ...view.runs.map((item) => [`R${item.id}`, item.completed ? "run (closed)" : "run", item.name]),
      ],
      `No cases or runs link ${key}.`,
      false,
    ),
  );
}
