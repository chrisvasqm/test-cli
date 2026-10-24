import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { kindedId } from "../../providers/testrail/ids.js";
import { listLimit } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, renderList } from "../../core/output.js";
import { isoTime, localTime } from "../render.js";
import { fileSize } from "./files.js";

interface ListOptions {
  limit: string;
}

export function registerList(attachment: Command): void {
  attachment
    .command("list <target>")
    .description("List the files attached to a case (C12), a run (R3), or a test's results (T45)")
    .option("-n, --limit <n>", "Most attachments to show", "100")
    .action(async (rawTarget: string, opts: ListOptions, cmd: Command) => {
      const target = kindedId(rawTarget);
      const limit = listLimit(opts.limit);
      const { mode } = bootstrap(cmd);
      const { items, hasMore } = await provider().attachments.list(target, limit);
      const attachments = items.map((item) => ({
        id: item.id,
        name: item.name,
        size: item.size,
        created: isoTime(item.created_on),
      }));
      printResult(mode, { target, attachments, hasMore }, () =>
        renderList(
          attachments.map((item) => [
            String(item.id),
            fileSize(item.size),
            localTime(item.created),
            item.name,
          ]),
          "No attachments.",
          hasMore,
        ),
      );
    });
}
