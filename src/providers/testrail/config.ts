import { z } from "zod";

/** A TestRail config file: the site, the account, and the default project (and suite). */
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
