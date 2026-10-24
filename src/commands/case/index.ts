import type { Command } from "commander";
import { registerList } from "./list.js";
import { registerView } from "./view.js";

export function registerCase(program: Command): void {
  const testCase = program.command("case").description("Read test cases");
  registerView(testCase);
  registerList(testCase);
}
