import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { kindedId } from "../../providers/testrail/ids.js";
import { intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { InputError } from "../../core/errors.js";
import { checkUploads } from "../../core/input.js";
import { printResult } from "../../core/output.js";
import type { AttachTarget } from "../../providers/types.js";
import { targetName, targetUrl } from "../link/target.js";
import { attached, renderAttached } from "./files.js";

interface AddOptions {
  result?: string;
}

export function registerAdd(attachment: Command): void {
  attachment
    .command("add <target> <files...>")
    .description(
      "Attach files (up to 256 MB each) to a case (C12), a run (R3), or a test's newest result (T45)",
    )
    .option("-rs, --result <id>", "With a test (T45): attach to this result of it instead of the newest")
    .action(async (rawTarget: string, paths: string[], opts: AddOptions, cmd: Command) => {
      const target = kindedId(rawTarget);
      if (opts.result !== undefined && target.kind !== "test") {
        throw new InputError("USAGE", "--result goes with a test id (T45), not a case or run");
      }
      const resultId = opts.result === undefined ? undefined : intInRange(opts.result, "--result", 1);
      const uploads = await checkUploads(paths);
      const { config, mode } = bootstrap(cmd);
      const { attachments } = provider();
      // TestRail attaches to a test's results, not to the test itself.
      const to: AttachTarget =
        target.kind === "test"
          ? { kind: "result", id: await attachments.resultOf(target.id, resultId) }
          : { kind: target.kind, id: target.id };
      const ids = await attachments.addAll(to, uploads);
      const view = {
        target: to,
        testId: target.kind === "test" ? target.id : null,
        attachments: attached(uploads, ids),
        url: targetUrl(config, target),
      };
      const name = to.kind === "result" ? `result #${to.id} of ${targetName(target)}` : targetName(target);
      printResult(mode, view, () => `${renderAttached(name, view.attachments)}\n${view.url}`);
    });
}
