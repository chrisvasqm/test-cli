import type { Command } from "commander";
import { registerClose } from "./close.js";
import { registerCreate } from "./create.js";
import { registerDelete } from "./delete.js";
import { registerList } from "./list.js";
import { registerView } from "./view.js";

export function registerRun(program: Command): void {
  const run = program.command("run").description("Read, create, close and delete test runs");
  registerView(run);
  registerList(run);
  registerCreate(run);
  registerClose(run);
  registerDelete(run);
}
