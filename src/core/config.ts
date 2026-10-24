import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import { CliError } from "./errors.js";

export const CONFIG_FILE = ".test-cli.json";
export const GLOBAL_CONFIG = join(homedir(), ".config", "test-cli", "config.json");
/** Names from before the rename to test-cli; still read, never written by setup. */
export const LEGACY_CONFIG_FILE = ".testrail-cli.json";
const LEGACY_GLOBAL_CONFIG = join(homedir(), ".config", "testrail-cli", "config.json");

/** The providers a config can name; a config without `provider` (from before 3.0.0) is TestRail. */
export const PROVIDERS = ["testrail"] as const;

export const testRailConfigSchema = z.object({
  provider: z.literal("testrail"),
  baseUrl: z
    .url({ protocol: /^https$/, error: "Use the https:// address of your TestRail site" })
    // A pasted browser link such as https://acme.testrail.io/index.php?/dashboard keeps only the site.
    .transform((raw) => {
      const url = new URL(raw);
      const path = url.pathname.replace(/\/index\.php.*$/, "").replace(/\/+$/, "");
      return `${url.origin}${path}`;
    }),
  email: z.email(),
  apiKey: z.string().min(1),
  projectId: z.number().int().positive(),
  /** Set for multi-suite and baseline projects; single-suite projects need none. */
  suiteId: z.number().int().positive().optional(),
});

export const configSchema = z.preprocess(
  (raw) => (isObject(raw) && raw.provider === undefined ? { provider: "testrail", ...raw } : raw),
  z.discriminatedUnion("provider", [testRailConfigSchema], {
    error: `provider must be one of: ${PROVIDERS.join(", ")}`,
  }),
);

export type Config = z.infer<typeof configSchema>;

function isObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

function walkUp(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    // Both names in each directory, so a parent's new file never shadows a closer old one.
    const candidate = [CONFIG_FILE, LEGACY_CONFIG_FILE].map((name) => join(dir, name)).find(existsSync);
    if (candidate) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function findConfigPath(explicit?: string): string | undefined {
  if (explicit) return resolve(explicit);
  return walkUp(process.cwd()) ?? [GLOBAL_CONFIG, LEGACY_GLOBAL_CONFIG].find(existsSync);
}

export function loadConfig(explicit?: string): { path: string; config: Config } {
  const path = findConfigPath(explicit);
  if (!path) {
    throw new CliError("CONFIG_MISSING", `No ${CONFIG_FILE} found. Run \`test-cli setup\` first.`);
  }
  if (!existsSync(path)) {
    throw new CliError(
      "CONFIG_MISSING",
      `${path} does not exist. Run \`test-cli --config ${path} setup\` first.`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new CliError("CONFIG_INVALID", `Could not read ${path}`, String(err));
  }
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError("CONFIG_INVALID", `Invalid config at ${path}`, parsed.error.issues);
  }
  return { path, config: parsed.data };
}

export function saveConfig(path: string, config: Config): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Tighten an existing file before the key is written into it.
  if (existsSync(path)) chmodSync(path, 0o600);
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** true = ignored, false = tracked by git and not ignored, undefined = not a git repo or git missing. */
export function isGitignored(configPath: string): boolean | undefined {
  const result = spawnSync("git", ["check-ignore", "-q", configPath], {
    cwd: dirname(configPath),
    stdio: "ignore",
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  return undefined;
}
