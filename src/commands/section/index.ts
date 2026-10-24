import type { Command } from "commander";
import { registerCreate } from "./create.js";
import { registerDelete } from "./delete.js";
import { registerEdit } from "./edit.js";
import { registerList } from "./list.js";
import { registerMove } from "./move.js";

export function registerSection(program: Command): void {
  const section = program
    .command("section")
    .description("List, create, edit, move and delete the sections that hold cases");
  registerList(section);
  registerCreate(section);
  registerEdit(section);
  registerMove(section);
  registerDelete(section);
}
