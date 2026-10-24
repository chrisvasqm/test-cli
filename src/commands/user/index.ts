import type { Command } from "commander";
import { registerList } from "./list.js";

export function registerUser(program: Command): void {
  const user = program.command("user").description("List users, e.g. to find who to assign");
  registerList(user);
}
