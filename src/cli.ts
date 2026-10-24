import { createRequire } from "node:module";
import { Command, CommanderError } from "commander";
import { registerAttachment } from "./commands/attachment/index.js";
import { registerCase } from "./commands/case/index.js";
import { registerConfiguration } from "./commands/configuration/index.js";
import { registerLink } from "./commands/link/index.js";
import { registerMilestone } from "./commands/milestone/index.js";
import { registerPlan } from "./commands/plan/index.js";
import { registerProject } from "./commands/project/index.js";
import { registerReport } from "./commands/report/index.js";
import { registerResult } from "./commands/result/index.js";
import { registerRun } from "./commands/run/index.js";
import { registerSection } from "./commands/section/index.js";
import { registerSetup } from "./commands/setup.js";
import { registerSuite } from "./commands/suite/index.js";
import { registerTest } from "./commands/test/index.js";
import { registerUser } from "./commands/user/index.js";
import { CliError, InputError } from "./core/errors.js";
import { outputMode } from "./core/bootstrap.js";
import { printError } from "./core/output.js";
import { closePrompts } from "./core/prompt.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const program = new Command()
  .name("testrail")
  .description("TestRail from the terminal, for humans and agents")
  .version(version, "-v, --version", "Print the version")
  .option("-j, --json", "Machine-readable output")
  .option("-c, --config <path>", "Path to a config file (default: nearest .testrail-cli.json)")
  .exitOverride()
  // Commander's own error lines are dropped (printError reports them); help text still prints.
  .configureOutput({ outputError: () => undefined });

registerSetup(program);
registerProject(program);
registerSuite(program);
registerSection(program);
registerCase(program);
registerRun(program);
registerPlan(program);
registerMilestone(program);
registerTest(program);
registerResult(program);
registerLink(program);
registerConfiguration(program);
registerReport(program);
registerUser(program);
registerAttachment(program);

/** 130 for Ctrl+C, 2 for bad usage, bad input or a missing --yes, 1 for everything else. */
function exitCode(err: unknown): number {
  if (err instanceof CliError && err.code === "INTERRUPTED") return 130;
  if (err instanceof InputError) return 2;
  return 1;
}

/** Help was shown: `--help` exits 0; a command group run without a subcommand exits 2. */
function isHelp(err: unknown): err is CommanderError {
  return (
    err instanceof CommanderError &&
    ["commander.help", "commander.helpDisplayed", "commander.version"].includes(err.code)
  );
}

function toCliError(err: unknown): unknown {
  if (err instanceof CommanderError) {
    return new InputError("USAGE", err.message.replace(/^error: /, ""));
  }
  return err;
}

program
  .parseAsync(process.argv)
  .then(() => closePrompts())
  .catch((raw: unknown) => {
    closePrompts();
    // exitCode, not process.exit(): stdout to a pipe is async on macOS and a JSON line could be cut.
    if (isHelp(raw)) {
      process.exitCode = raw.exitCode === 0 ? 0 : 2;
      return;
    }
    const err = toCliError(raw);
    printError(outputMode(program), err);
    process.exitCode = exitCode(err);
  });
