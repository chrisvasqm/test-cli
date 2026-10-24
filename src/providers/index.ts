import type { Config } from "../core/config.js";
import { CliError, InputError } from "../core/errors.js";
import type { Capability } from "./capability.js";
import { createTestRail, type TestRailCredentials, type TestRailProvider } from "./testrail/index.js";

export type { Capability } from "./capability.js";

/**
 * The services commands use. TestRail is the only provider, so this is its shape; the second
 * provider (Qase) turns it into an interface with neutral types.
 */
export type Provider = TestRailProvider;

let active: Provider | undefined;

/** Builds the provider the config names; `provider()` returns it from then on. */
export function configureProvider(config: Config): Provider {
  active = createTestRail(config);
  return active;
}

/** `setup` connects before any config exists, with the credentials it just asked for. */
export function connectTestRail(creds: TestRailCredentials): Provider {
  active = createTestRail(creds);
  return active;
}

export function provider(): Provider {
  if (!active) {
    throw new CliError("PROVIDER_NOT_CONFIGURED", "bootstrap() must run before the provider is used.");
  }
  return active;
}

/** NOT_SUPPORTED (exit 2) when the provider lacks the feature, e.g. milestones. */
export function requireCapability(current: Provider, need: Capability): void {
  if (!current.capabilities.has(need)) {
    throw new InputError("NOT_SUPPORTED", `${current.label} does not support ${need}.`);
  }
}
