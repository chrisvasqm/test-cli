import { Command, Option } from "commander";

/** Every two-letter short flag and its long flags, across all commands (`ru` → `--run`, `--from-run`). */
const pairs = new Map<string, Set<string>>();

const PAIR = /^-([a-z]{2}), (--[a-z-]+)(.*)$/;

/**
 * A command whose options may have a two-letter short flag, e.g. "-sc, --section <id>".
 * Commander allows one letter after a dash, so such an option is registered by its long
 * flag, help still shows both, and expandShortFlags rewrites `-sc` before parsing.
 * A short flag may stand for related long flags on different commands (`-ru` is --run or
 * --from-run), but a command with two long flags for one short flag fails at startup.
 */
export class FlagCommand extends Command {
  override createCommand(name?: string): Command {
    return new FlagCommand(name);
  }

  override createOption(flags: string, description?: string): Option {
    const match = PAIR.exec(flags);
    if (!match) return new Option(flags, description);
    const [, short = "", long = "", rest = ""] = match;
    const clash = this.options.find((option) => option.flags.startsWith(`-${short}, `));
    if (clash) throw new Error(`-${short} means both ${clash.long ?? ""} and ${long}`);
    pairs.set(short, (pairs.get(short) ?? new Set<string>()).add(long));
    const option = new Option(`${long}${rest}`, description);
    option.flags = flags;
    return option;
  }
}

/** The command argv runs: subcommand names are followed from the program down. */
function target(program: Command, args: string[]): Command {
  let current = program;
  for (const arg of args) {
    const next = current.commands.find((cmd) => cmd.name() === arg || cmd.aliases().includes(arg));
    if (next) current = next;
  }
  return current;
}

/** The long flag for a two-letter short: the only one, or the one the command has. */
function longFlag(short: string, command: Command): string | undefined {
  const longs = [...(pairs.get(short) ?? [])];
  if (longs.length <= 1) return longs[0];
  return longs.find((long) => command.options.some((option) => option.long === long));
}

/** argv with each two-letter short flag (`-sc`) replaced by its long flag, up to `--`. */
export function expandShortFlags(program: Command, argv: string[]): string[] {
  const end = argv.indexOf("--");
  const command = target(program, argv.slice(2, end === -1 ? undefined : end));
  return argv.map((arg, index) => {
    if (end !== -1 && index > end) return arg;
    return (/^-[a-z]{2}$/.test(arg) && longFlag(arg.slice(1), command)) || arg;
  });
}
