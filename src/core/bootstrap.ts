import type { Command } from "commander";
import { loadConfig, type Config } from "./config.js";
import { configureProvider, requireCapability, type Capability } from "../providers/index.js";
import type { OutputMode } from "./output.js";

interface GlobalOptions {
  json?: boolean;
  config?: string;
}

interface Context {
  config: Config;
  /** File the config was loaded from. */
  configPath: string;
  mode: OutputMode;
}

export function globalOptions(cmd: Command): GlobalOptions {
  return cmd.optsWithGlobals<GlobalOptions>();
}

export function outputMode(cmd: Command): OutputMode {
  return globalOptions(cmd).json ? "json" : "human";
}

/**
 * Load config for the current directory and set up its provider (`provider()` returns it).
 * `need` names an optional feature the command uses; a provider without it fails with NOT_SUPPORTED.
 */
export function bootstrap(cmd: Command, need?: Capability): Context {
  const opts = globalOptions(cmd);
  const { config, path } = loadConfig(opts.config);
  const current = configureProvider(config);
  if (need) requireCapability(current, need);
  return { config, configPath: path, mode: outputMode(cmd) };
}
