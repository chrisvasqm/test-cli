import type { Command } from "commander";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { LinkService } from "../../services/link.service.js";
import { jiraKeys } from "../../core/args.js";
import { linkTarget, partition, renderKeys, targetName, targetUrl } from "./target.js";

export function registerRemove(link: Command): void {
  link
    .command("remove <target> <keys...>")
    .description("Unlink Jira keys from a case or run, e.g. C12 KAN-1 (a test's links cannot be removed)")
    .action(async (rawTarget: string, rawKeys: string[], _opts: unknown, cmd: Command) => {
      const target = linkTarget(rawTarget);
      if (target.kind === "test") {
        throw new InputError(
          "LINK_NOT_REMOVABLE",
          `T${target.id}'s Jira keys are defects on its results, and TestRail cannot edit or delete results.`,
        );
      }
      const keys = jiraKeys(rawKeys);
      const { config, mode } = bootstrap(cmd);
      const links = new LinkService();
      const loaded = await links.load(target);
      const { linked: removed, unlinked: notLinked } = partition(keys, loaded.keys);
      const left = partition(loaded.keys, removed).unlinked;
      if (removed.length > 0) {
        await links.assertWritable(target, loaded);
        await links.setRefs(target, left);
      }
      const name = targetName(target);
      const view = { target: name, keys: left, removed, notLinked, url: targetUrl(config, target) };
      printResult(mode, view, () => {
        const head = removed.length > 0 ? `Unlinked ${removed.join(", ")} from ${name}` : "Nothing to remove";
        const skipped = notLinked.length > 0 ? ` (not linked: ${notLinked.join(", ")})` : "";
        return `${head}${skipped}\n${renderKeys(name, left)}\n${view.url}`;
      });
    });
}
