import type { Command } from "commander";
import { registerClose } from "./close.js";
import { registerCreate } from "./create.js";
import { registerDelete } from "./delete.js";
import { registerEdit } from "./edit.js";
import { registerList } from "./list.js";
import { registerRetest } from "./retest.js";
import { registerSync } from "./sync.js";
import { registerView } from "./view.js";

export function registerRun(program: Command): void {
  const run = program
    .command("run")
    .description("Read, create, edit, close and delete test runs; retest fixed bugs");
    .description("Read, create, edit, close and delete test runs, and sync results to Jira");
  registerView(run);
  registerList(run);
  registerCreate(run);
  registerEdit(run);
  registerClose(run);
  registerDelete(run);
  registerRetest(run);
  registerSync(run);
}
