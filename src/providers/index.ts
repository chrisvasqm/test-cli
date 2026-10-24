import { CliError, InputError } from "../core/errors.js";
import { CAPABILITIES, type Capability } from "./capability.js";
import { createTestRail, type TestRailCredentials, type TestRailProvider } from "./testrail/index.js";

export type { Capability } from "./capability.js";

/**
 * The services commands use. TestRail is the only provider, so this is its shape; the second
 * provider (Qase) turns it into an interface with neutral types.
 */
export type Provider = TestRailProvider;

/** What a provider needs to connect: a whole config, or what `setup` has asked for so far. */
export type Connection = { provider: "testrail" } & TestRailCredentials;

let active: Provider | undefined;

/** Builds the provider the connection names; `provider()` returns it from then on. */
export function configureProvider(connection: Connection): Provider {
  switch (connection.provider) {
    case "testrail":
      active = gated(createTestRail(connection));
      return active;
  }
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

/** The provider with each optional service behind its capability, so no call site can skip the check. */
function gated(built: Provider): Provider {
  const out = { ...built };
  for (const need of CAPABILITIES) {
    if (built.capabilities.has(need)) continue;
    Object.defineProperty(out, need, {
      get: () => requireCapability(built, need),
      enumerable: true,
    });
  }
  return out;
}
