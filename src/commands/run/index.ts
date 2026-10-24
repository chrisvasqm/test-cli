import type { Command } from "commander";
import { registerClose } from "./close.js";
import { registerCreate } from "./create.js";
import { registerDelete } from "./delete.js";
import { registerEdit } from "./edit.js";
import { registerList } from "./list.js";
import { registerRetest } from "./retest.js";
import { registerView } from "./view.js";

export function registerRun(program: Command): void {
  const run = program
    .command("run")
    .description("Read, create, edit, close and delete test runs; retest fixed bugs");
  registerView(run);
  registerList(run);
  registerCreate(run);
  registerEdit(run);
  registerClose(run);
  registerDelete(run);
  registerRetest(run);
}
