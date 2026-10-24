import type { Command } from "commander";
import { registerCreate } from "./create.js";
import { registerDelete } from "./delete.js";
import { registerEdit } from "./edit.js";
import { registerList } from "./list.js";
import { registerView } from "./view.js";

export function registerCase(program: Command): void {
  const testCase = program.command("case").description("Read and change test cases");
  registerView(testCase);
  registerList(testCase);
  registerCreate(testCase);
  registerEdit(testCase);
  registerDelete(testCase);
}
