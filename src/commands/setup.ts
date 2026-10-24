import { existsSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Command } from "commander";
import { configureProvider } from "../providers/index.js";
import { z } from "zod";
import { globalOptions, outputMode } from "../core/bootstrap.js";
import {
  CONFIG_FILE,
  GLOBAL_CONFIG,
  LEGACY_CONFIG_FILE,
  configSchema,
  isGitignored,
  saveConfig,
} from "../core/config.js";
import { testRailConfigSchema } from "../providers/testrail/config.js";
import { confirm } from "../core/confirm.js";
import { CliError, InputError } from "../core/errors.js";
import { info, printResult, table, type OutputMode } from "../core/output.js";
import { ask, askSecret } from "../core/prompt.js";
import { SUITE_MODE_SINGLE, type Suite } from "../providers/testrail/types.js";
import { savedConfig } from "./render.js";

interface SetupOptions {
  global?: boolean;
  yes?: boolean;
}

const shape = testRailConfigSchema.shape;

async function askValid<T>(
  prompt: () => Promise<string>,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  hint: string,
): Promise<T> {
  for (;;) {
    const parsed = schema.safeParse(await prompt());
    if (parsed.success && parsed.data !== undefined) return parsed.data;
    process.stderr.write(`${hint}\n`);
  }
}

/** Prints a numbered list on stderr and returns the picked item. */
async function pick<T>(items: T[], label: (item: T) => string, what: string): Promise<T> {
  info(items.map((item, index) => `${String(index + 1).padStart(3)}  ${label(item)}`).join("\n"));
  const choice = await askValid(
    () => ask(`Pick a ${what} number`, "1"),
    z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(items.length)),
    `Enter a number between 1 and ${items.length}`,
  );
  return items[choice - 1]!;
}

export function registerSetup(program: Command): void {
  program
    .command("setup")
    .description(`Create ${CONFIG_FILE} in the current directory by prompting for TestRail details`)
    .option("-g, --global", `Write to ${GLOBAL_CONFIG} instead`)
    .option("-y, --yes", "Overwrite an existing config without asking")
    .action(async (opts: SetupOptions, cmd: Command) => {
      const all = globalOptions(cmd);
      const mode = outputMode(cmd);
      if (opts.global && all.config)
        throw new InputError("USAGE", "Use either --global or --config, not both.");
      const target = opts.global ? GLOBAL_CONFIG : resolve(all.config ?? CONFIG_FILE);
      // A config under the old name here would be shadowed by the new file, key and all, so it is replaced too.
      const legacy = opts.global || all.config ? undefined : resolve(LEGACY_CONFIG_FILE);
      const replaced = [target, legacy].filter(
        (path): path is string => path !== undefined && existsSync(path),
      );
      // Ask before anything else: replacing a config throws away its key and project.
      if (replaced.length > 0 && !opts.yes)
        await confirm(
          `${replaced.join(" and ")} already ${replaced.length > 1 ? "exist" : "exists"}. Replace it?`,
        );
      await runSetup(target, mode);
      if (legacy) rmSync(legacy, { force: true });
    });
}

async function runSetup(path: string, mode: OutputMode): Promise<void> {
  const baseUrl = await askValid(
    () => ask("TestRail URL (e.g. https://acme.testrail.io)"),
    shape.baseUrl,
    "Enter a full URL including https://",
  );
  const email = await askValid(
    () => ask("TestRail account email"),
    shape.email,
    "Enter a valid email address",
  );
  const apiKey = await askValid(
    () => askSecret("API key (TestRail > My Settings > API Keys)"),
    shape.apiKey,
    "API key cannot be empty",
  );

  const { projects, users } = configureProvider({ provider: "testrail", baseUrl, email, apiKey });
  // Listing projects proves the credentials. Only then look up the name, so a wrong key
  // costs one failed login (repeated failures can lock the account), not two.
  const { items: active, hasMore } = await projects.listActive();
  const me = await users.byEmail(email).catch(() => undefined);
  info(`Authenticated as ${me?.name ?? email}`);
  if (active.length === 0) throw new CliError("NO_PROJECTS", "This account can see no active projects.");
  if (hasMore) info(`Showing the first ${active.length} projects; edit projectId in the config for another.`);
  const project = await pick(active, (item) => `${item.name} (P${item.id})`, "project");

  let suite: Suite | undefined;
  // Multi-suite and baseline projects both need a suite_id for cases and runs.
  if (project.suite_mode !== SUITE_MODE_SINGLE) {
    const suites = await projects.activeSuites(project.id);
    suite =
      suites.length === 1 ? suites[0] : await pick(suites, (item) => `${item.name} (S${item.id})`, "suite");
  }

  const config = configSchema.parse({
    provider: "testrail",
    baseUrl,
    email,
    apiKey,
    projectId: project.id,
    suiteId: suite?.id,
  });
  saveConfig(path, config);

  const ignored = path === GLOBAL_CONFIG ? undefined : isGitignored(path);
  const warning =
    ignored === false
      ? `${basename(path)} is not ignored by git (add it to .gitignore, or \`git rm --cached\` it if tracked) so the API key is never committed.`
      : undefined;

  const { data, rows } = savedConfig(path, project, suite);
  rows.push(["Account", me?.name ?? email]);
  printResult(mode, { ...data, userId: me?.id ?? null, warning }, () =>
    [table(rows), warning ? `\nwarning: ${warning}` : ""].join(""),
  );
}
