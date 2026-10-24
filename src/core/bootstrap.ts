import type { Command } from "commander";
import { loadConfig, type Config } from "./config.js";
import { HttpClient } from "./http.js";
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

/** Load config for the current directory and configure the HTTP client. */
export function bootstrap(cmd: Command): Context {
  const opts = globalOptions(cmd);
  const { config, path } = loadConfig(opts.config);
  HttpClient.configure(config);
  return { config, configPath: path, mode: outputMode(cmd) };
}
