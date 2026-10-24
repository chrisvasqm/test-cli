import type { Command } from "commander";
import { registerClose } from "./close.js";
import { registerCreate } from "./create.js";
import { registerDelete } from "./delete.js";
import { registerEdit } from "./edit.js";
import { registerList } from "./list.js";
import { registerReopen } from "./reopen.js";
import { registerView } from "./view.js";

export function registerMilestone(program: Command): void {
  const milestone = program.command("milestone").description("Read, create, change and delete milestones");
  registerView(milestone);
  registerList(milestone);
  registerCreate(milestone);
  registerEdit(milestone);
  registerClose(milestone);
  registerReopen(milestone);
  registerDelete(milestone);
}
