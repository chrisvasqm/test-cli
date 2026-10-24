import type { Command } from "commander";
import { registerList } from "./list.js";
import { registerView } from "./view.js";

export function registerRun(program: Command): void {
  const run = program.command("run").description("Read test runs");
  registerView(run);
  registerList(run);
}
