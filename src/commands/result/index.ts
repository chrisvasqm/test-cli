import type { Command } from "commander";
import { registerAdd } from "./add.js";
import { registerImport } from "./import.js";

export function registerResult(program: Command): void {
  const result = program.command("result").description("Report test results (results are append-only)");
  registerAdd(result);
  registerImport(result);
}
