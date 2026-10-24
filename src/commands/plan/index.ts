import type { Command } from "commander";
import { registerAddRun } from "./add-run.js";
import { registerClose } from "./close.js";
import { registerCreate } from "./create.js";
import { registerDelete } from "./delete.js";
import { registerList } from "./list.js";
import { registerView } from "./view.js";

export function registerPlan(program: Command): void {
  const plan = program
    .command("plan")
    .description("Read, create, close and delete test plans (runs grouped by suite and configuration)");
  registerView(plan);
  registerList(plan);
  registerCreate(plan);
  registerAddRun(plan);
  registerClose(plan);
  registerDelete(plan);
}
