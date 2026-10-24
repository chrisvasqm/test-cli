import type { Command } from "commander";
import { registerList } from "./list.js";
import { registerUse } from "./use.js";

export function registerProject(program: Command): void {
  const project = program.command("project").description("List projects and pick the one to work in");
  registerList(project);
  registerUse(project);
}
