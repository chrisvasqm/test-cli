import type { Command } from "commander";
import { registerList } from "./list.js";

export function registerConfiguration(program: Command): void {
  const configuration = program
    .command("configuration")
    .description("List configurations (e.g. browsers, operating systems) for test plans");
  registerList(configuration);
}
