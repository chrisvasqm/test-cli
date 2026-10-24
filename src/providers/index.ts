import { CliError, InputError } from "../core/errors.js";
import { CAPABILITIES, type Capability } from "./capability.js";
import type { Credentials } from "./testrail/http.js";
import type { Provider } from "./provider.js";
import { createTestRail } from "./testrail/index.js";

export type { Capability } from "./capability.js";
export type { Provider } from "./provider.js";

/** What a provider needs to connect: a whole config, or what `setup` has asked for so far. */
export type Connection = { provider: "testrail" } & Credentials;

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

/** The service behind an optional feature, or undefined when the provider lacks it. */
export function supported<Need extends Capability>(
  current: Provider,
  need: Need,
): Provider[Need] | undefined {
  return current.capabilities.has(need) ? current[need] : undefined;
}

/**
 * The provider with each optional service behind its capability, so commands cannot use a feature
 * the provider lacks. Services inside a provider only call that provider's own endpoints.
 */
function gated(built: Provider): Provider {
  const out = { ...built };
  for (const need of CAPABILITIES) {
    if (built.capabilities.has(need)) continue;
    Object.defineProperty(out, need, {
      get: () => {
        throw new InputError("NOT_SUPPORTED", `${built.label} does not support ${need}.`);
      },
      enumerable: true,
    });
  }
  return out;
}
