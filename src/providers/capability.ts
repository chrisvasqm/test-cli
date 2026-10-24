/**
 * Features that not every test management tool has. A command that needs one checks it with
 * `bootstrap(cmd, capability)`; a provider without it fails with NOT_SUPPORTED (exit 2).
 * Cases, sections, runs, tests, results and Jira links are core: every provider has them.
 */
export const CAPABILITIES = [
  "suites",
  "plans",
  "milestones",
  "configurations",
  "reports",
  "attachments",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
