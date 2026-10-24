import type { Command } from "commander";
import { registerAdd } from "./add.js";
import { registerList } from "./list.js";

export function registerAttachment(program: Command): void {
  const attachment = program
    .command("attachment")
    .description("Attach files to cases, runs and results, and list them");
  registerList(attachment);
  registerAdd(attachment);
}
