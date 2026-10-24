# AGENTS.md

`test-cli` (command `test-cli`, alias `testrail`) is a test management CLI written in TypeScript for Node.js. TestRail is its only provider today. Agents use it in place of a TestRail MCP server.

## Using the CLI

The agent guide is the `test-cli` skill in [chrisvasqm/skills](https://github.com/chrisvasqm/skills/blob/main/skills/test-cli/SKILL.md). It covers setup, safety rules, commands, `--json` data shapes and every error code. `npx skills add chrisvasqm/skills --skill test-cli` installs it, so it has to stand alone.

When a command, flag, data shape or error code changes, update the README command table in the same PR, and open a matching PR for SKILL.md in chrisvasqm/skills.

Every flag has a short form (`-s` for `--status`). Give each new flag one too:

- Short flags are lowercase. Each one has a single meaning across all commands (`-n` how many, `-f` read text from a file, `-r` refs, `-s` status, `-a` assignee, `-y` yes, `-w` sprint, `-sc` section, `-na` name, `-cp` closed or completed, `-fj` from Jira, `-ca`/`-ru`/`-su`/`-ml` case, run, suite and milestone ids).
- The first flag to use a letter keeps it. A later flag with another meaning gets two letters (`-sc, --section` because `-s` is `--status`). `src/core/flags.ts` registers these and rewrites them before commander parses. A two-letter short may name related long flags on different commands (`-ru` is `--run` or `--from-run`), but never two on one command.
- Never reuse the global `-j`/`-c` on a subcommand: commander also reads global flags after the subcommand.

## Working on this repo

- **Stack.**
  - Node 24, TypeScript (strict ESM, NodeNext, `.js` import suffixes), commander and zod.
  - `pnpm build` runs `tsc --noEmit`, then esbuild bundles the CLI into `dist/cli.js`. `dist/index.js` (the Node version guard) is built on its own so old Node can parse it. Releases have no runtime dependencies.
- **Layout.**
  - `src/core`: provider-neutral pieces: config (a zod union on `provider`; a file without it is TestRail), output, prompts, errors, paging helpers, Jira (jira-cli) and argument parsers.
  - `src/providers/index.ts`: the registry. `bootstrap(cmd, capability?)` builds the configured provider; commands get services with `provider().cases`, `provider().runs`, …. A command that needs an optional feature (`suites`, `plans`, `milestones`, `configurations`, `reports`, `attachments`, see `capability.ts`) passes it, and a provider without it fails with `NOT_SUPPORTED` (exit 2).
  - `src/providers/testrail/`: the only provider today. `http.ts` (client singleton: auth, retries, timeouts, error mapping), `paging.ts` (`collectPages`), `errors.ts` (`notFound`), `ids.ts` (C/R/T/P/S/M ids), `lookup.ts` (names to ids), `types.ts` and `services/` (one class per group of endpoints). Services turn "not found" (404, or 400 naming the path's id field) into `*_NOT_FOUND` codes with `notFoundAs`.
  - `src/commands`: commander wiring and rendering only. oxlint stops commands and core from importing TestRail's client, paging, errors or service classes; types, ids and lookups are fine until a second provider brings neutral types.
- **TestRail API quirks.**
  - URLs are `<site>/index.php?/api/v2/<method>/<ids>&<params>`: filters follow with `&`, not `?`.
  - Every write is a POST. Unknown ids come back as 400 "Field :case_id is not a valid test case.", not 404.
  - `delete_*&soft=1` is not a safe preview on TestRail Cloud: it deleted the case. Never send it.
  - Bulk GETs (`get_suites`, `get_users`, `get_plans`, `get_milestones`, …) are paged on Cloud (`{suites: [...], _links}`), bare arrays on older servers; read them with `collectPages`. `get_configs` and `get_reports` stay bare arrays.
  - `get_users/<project>` can come back empty on Cloud; `UserService.list` then falls back to `get_users`.
  - Test plans share the run id sequence (`R7`); `get_runs` leaves out runs inside plans.
- **Checks.**
  - `pnpm check` runs the build, oxlint (max-depth 2, id-length ≥ 2, prefer-for-of, no-console) and `prettier --check`.
  - There are no automated tests (owner decision). Verify with `pnpm check` and, after a command or flag change, `pnpm regression` (every command with short flags; Jira features use the real `jira` CLI, set up for this directory, and its throwaway tickets are deleted), plus live runs against the owner's throwaway TestRail project, with the owner's OK.
- **Config file.** `.test-cli.json` (`provider: "testrail"`, `baseUrl` https only, `email`, `apiKey`, `projectId`, optional `suiteId`) is gitignored and saved with mode 600; the old `.testrail-cli.json` still loads. Never read either or commit them.
- **Dependencies.** pnpm only, with exact versions. Never relax the supply-chain policy in `pnpm-workspace.yaml`.
- **Pull requests.** Every change gets a branch and a squash-merged PR. There is no AI credit in commits or PRs. Bumping, release notes and `pnpm release` follow [README → Releasing](README.md#releasing).
