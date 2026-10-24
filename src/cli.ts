import { createRequire } from "node:module";
import { Command, CommanderError } from "commander";
import { registerSetup } from "./commands/setup.js";
import { CliError } from "./core/errors.js";
import { outputMode } from "./core/bootstrap.js";
import { printError } from "./core/output.js";
import { closePrompts } from "./core/prompt.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const program = new Command()
  .name("testrail")
  .description("TestRail from the terminal, for humans and agents")
  .version(version, "-v, --version", "Print the version")
  .option("--json", "Machine-readable output")
  .option("--config <path>", "Path to a config file (default: nearest .testrail-cli.json)")
  .exitOverride()
  // Commander's own error lines are dropped (printError reports them); help text still prints.
  .configureOutput({ outputError: () => undefined });

registerSetup(program);

/** 130 for Ctrl+C, 2 for bad usage, missing input or a missing --yes, 1 for everything else. */
function exitCode(err: unknown): number {
  if (err instanceof CliError && err.code === "INTERRUPTED") return 130;
  if (err instanceof CliError && ["USAGE", "INPUT_EOF", "CONFIRM_REQUIRED"].includes(err.code)) return 2;
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
    return new CliError("USAGE", err.message.replace(/^error: /, ""));
  }
  return err;
}

program
  .parseAsync(process.argv)
  .then(() => closePrompts())
  .catch((raw: unknown) => {
    closePrompts();
    if (isHelp(raw)) process.exit(raw.exitCode === 0 ? 0 : 2);
    const err = toCliError(raw);
    printError(outputMode(program), err);
    process.exit(exitCode(err));
  });
