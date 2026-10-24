import type { Command } from "commander";
import { registerCreate } from "./create.js";
import { registerDelete } from "./delete.js";
import { registerEdit } from "./edit.js";
import { registerHistory } from "./history.js";
import { registerList } from "./list.js";
import { registerCopy, registerMove } from "./transfer.js";
import { registerView } from "./view.js";

export function registerCase(program: Command): void {
  const testCase = program.command("case").description("Read and change test cases");
  registerView(testCase);
  registerList(testCase);
  registerHistory(testCase);
  registerCreate(testCase);
  registerEdit(testCase);
  registerCopy(testCase);
  registerMove(testCase);
  registerDelete(testCase);
}
