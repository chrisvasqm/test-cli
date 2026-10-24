import { z } from "zod";
import { testRailConfigSchema } from "./testrail/config.js";

/** The providers a config can name. */
export const PROVIDERS = ["testrail"] as const;

/** Every provider's config schema, told apart by `provider`. */
export const providerConfigSchema = z.discriminatedUnion("provider", [testRailConfigSchema], {
  error: `provider must be one of: ${PROVIDERS.join(", ")}`,
});
