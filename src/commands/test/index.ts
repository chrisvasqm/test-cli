import type { Command } from "commander";
import { registerList } from "./list.js";
import { registerView } from "./view.js";

export function registerTest(program: Command): void {
  const test = program.command("test").description("Read tests (a case inside a run) and their results");
  registerView(test);
  registerList(test);
}
