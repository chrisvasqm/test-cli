import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { bootstrap } from "../../core/bootstrap.js";
import { checkJiraKeys } from "../../core/jira.js";
import { printResult } from "../../core/output.js";
import { jiraKeys } from "../../core/args.js";
import { linkTarget, partition, renderKeys, targetName, targetUrl } from "./target.js";

interface AddOptions {
  check: boolean;
}

export function registerAdd(link: Command): void {
  link
    .command("add <target> <keys...>")
    .description("Link Jira keys to a case or run (refs) or a test (defects), e.g. C12 KAN-1")
    .option("-nc, --no-check", "Don't check with jira-cli that the tickets exist")
    .action(async (rawTarget: string, rawKeys: string[], opts: AddOptions, cmd: Command) => {
      const target = linkTarget(rawTarget);
      const keys = jiraKeys(rawKeys);
      const { config, mode } = bootstrap(cmd);
      const links = provider().links;
      const loaded = await links.load(target);
      const current = loaded.keys;
      const { linked: already, unlinked: added } = partition(keys, current);
      let checked = false;
      if (added.length > 0) {
        // In turn, not in parallel: the Jira check may prompt for `jira setup`. Both finish before the write.
        await links.assertWritable(loaded);
        checked = opts.check ? await checkJiraKeys(added) : false;
        await links.add(target, loaded, added);
      }
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
