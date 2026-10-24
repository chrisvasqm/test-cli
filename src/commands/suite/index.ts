import type { Command } from "commander";
import { registerCreate } from "./create.js";
import { registerDelete } from "./delete.js";
import { registerEdit } from "./edit.js";
import { registerList } from "./list.js";
import { registerView } from "./view.js";

export function registerSuite(program: Command): void {
  const suite = program.command("suite").description("List, read, create, edit and delete suites");
  registerList(suite);
  registerView(suite);
  registerCreate(suite);
  registerEdit(suite);
  registerDelete(suite);
}
