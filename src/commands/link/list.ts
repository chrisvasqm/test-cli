import type { Command } from "commander";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult } from "../../core/output.js";
import { LinkService } from "../../services/link.service.js";
import { linkTarget, renderKeys, targetName, targetUrl } from "./target.js";

export function registerList(link: Command): void {
  link
    .command("list <target>")
    .description("Show the Jira keys linked to a case, run or test, e.g. C12")
    .action(async (rawTarget: string, _opts: unknown, cmd: Command) => {
      const target = linkTarget(rawTarget);
      const { config, mode } = bootstrap(cmd);
      const { keys } = await new LinkService().load(target);
      const view = { target: targetName(target), keys, url: targetUrl(config, target) };
      printResult(mode, view, () => `${renderKeys(view.target, keys)}\n${view.url}`);
    });
}
