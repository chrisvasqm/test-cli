import type { Command } from "commander";
import { registerAdd } from "./add.js";
import { registerList } from "./list.js";
import { registerRemove } from "./remove.js";

export function registerLink(program: Command): void {
  const link = program
    .command("link")
    .description("Link Jira keys to cases and runs (refs) and to tests (result defects)");
  registerList(link);
  registerAdd(link);
  registerRemove(link);
}
