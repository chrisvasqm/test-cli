import type { Command } from "commander";
import { bootstrap } from "../../core/bootstrap.js";
import { checkJiraKeys } from "../../core/jira.js";
import { printResult } from "../../core/output.js";
import { LinkService } from "../../services/link.service.js";
import { jiraKeys, linkTarget, partition, renderKeys, targetName, targetUrl } from "./target.js";

interface AddOptions {
  check: boolean;
}

export function registerAdd(link: Command): void {
  link
    .command("add <target> <keys...>")
    .description("Link Jira keys to a case or run (refs) or a test (defects), e.g. C12 KAN-1")
    .option("--no-check", "Don't check with jira-cli that the tickets exist")
    .action(async (rawTarget: string, rawKeys: string[], opts: AddOptions, cmd: Command) => {
      const target = linkTarget(rawTarget);
      const keys = jiraKeys(rawKeys);
      const { config, mode } = bootstrap(cmd);
      const links = new LinkService();
      const current = await links.keys(target);
      const { linked: already, unlinked: added } = partition(keys, current);
      // Only new keys are checked; the check runs before any write.
      const checked = added.length > 0 && opts.check ? await checkJiraKeys(added) : false;
      if (added.length > 0) await links.add(target, current, added);
      const name = targetName(target);
      const view = {
        target: name,
        keys: [...current, ...added],
        added,
        already,
        checked,
        url: targetUrl(config, target),
      };
      printResult(mode, view, () => {
        const head = added.length > 0 ? `Linked ${added.join(", ")} to ${name}` : "Nothing to add";
        const skipped = already.length > 0 ? ` (already linked: ${already.join(", ")})` : "";
        return `${head}${skipped}\n${renderKeys(name, view.keys)}\n${view.url}`;
      });
    });
}
