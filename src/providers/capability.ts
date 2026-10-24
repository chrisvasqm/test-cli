/**
 * Features that not every test management tool has, each named after the provider service behind it.
 * Reading that service from a provider without the feature fails with NOT_SUPPORTED (exit 2).
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
