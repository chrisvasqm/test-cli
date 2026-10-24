import type { Command } from "commander";
import { registerList } from "./list.js";
import { registerUse } from "./use.js";
import { registerView } from "./view.js";

export function registerProject(program: Command): void {
  const project = program
    .command("project")
    .description("List projects, see one's overview, and pick the one to work in");
  registerList(project);
  registerUse(project);
  registerView(project);
}
