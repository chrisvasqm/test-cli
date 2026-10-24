import { stdin } from "node:process";
import { CliError } from "./errors.js";
import { ask } from "./prompt.js";

/**
 * Ask before a destructive action (callers skip it for `--yes`). Without a terminal
 * (agents, scripts) the action needs `--yes`, so nothing is deleted by accident.
 */
export async function confirm(question: string): Promise<void> {
  if (!stdin.isTTY) throw new CliError("CONFIRM_REQUIRED", `${question} Pass --yes to confirm.`);
  const answer = await ask(`${question} Type "yes" to confirm`);
  if (answer.toLowerCase() !== "yes") throw new CliError("CANCELLED", "Nothing was changed.");
}
