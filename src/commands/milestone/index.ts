import type { Command } from "commander";
import { registerCreate } from "./create.js";
import { registerList } from "./list.js";
import { registerView } from "./view.js";

export function registerMilestone(program: Command): void {
  const milestone = program.command("milestone").description("Read and create milestones");
  registerView(milestone);
  registerList(milestone);
  registerCreate(milestone);
}
