import type { Command } from "commander";
import { registerList } from "./list.js";
import { registerRun } from "./run.js";

export function registerReport(program: Command): void {
  const report = program.command("report").description("List and run on-demand report templates");
  registerList(report);
  registerRun(report);
}
