# AGENTS.md

`testrail` is a TestRail CLI written in TypeScript for Node.js. Agents use it in place of a TestRail MCP server.

## Using the CLI

The agent guide is the `testrail-cli` skill in [chrisvasqm/skills](https://github.com/chrisvasqm/skills/blob/main/skills/testrail-cli/SKILL.md). It covers setup, safety rules, commands, `--json` data shapes and every error code. `npx skills add chrisvasqm/skills --skill testrail-cli` installs it, so it has to stand alone.

When a command, flag, data shape or error code changes, update the README command table in the same PR, and open a matching PR for SKILL.md in chrisvasqm/skills.

## Working on this repo

- **Stack.**
  - Node 24, TypeScript (strict ESM, NodeNext, `.js` import suffixes), commander and zod.
  - `pnpm build` runs `tsc --noEmit`, then esbuild bundles the CLI into `dist/cli.js`. `dist/index.js` (the Node version guard) is built on its own so old Node can parse it. Releases have no runtime dependencies.
- **Layout.**
  - `src/core`: HTTP client singleton (auth, retries, timeouts, error mapping), config, output, prompts, paging, errors and argument parsers.
  - `src/services`: one class per group of TestRail endpoints. Services turn "not found" (404, or 400 naming the path's id field) into `*_NOT_FOUND` codes with `notFoundAs`.
  - `src/commands`: commander wiring and rendering only.
- **TestRail API quirks.**
  - URLs are `<site>/index.php?/api/v2/<method>/<ids>&<params>`: filters follow with `&`, not `?`.
  - Every write is a POST. Unknown ids come back as 400 "Field :case_id is not a valid test case.", not 404.
  - `delete_*&soft=1` is not a safe preview on TestRail Cloud: it deleted the case. Never send it.
- **Checks.**
  - `pnpm check` runs the build, oxlint (max-depth 2, id-length ≥ 2, prefer-for-of, no-console) and `prettier --check`.
  - There are no automated tests (owner decision). Verify with `pnpm check` and live runs against the owner's throwaway TestRail project, with the owner's OK.
- **Config file.** `.testrail-cli.json` (`baseUrl` https only, `email`, `apiKey`, `projectId`, optional `suiteId`) is gitignored and saved with mode 600. Never read it or commit it.
- **Dependencies.** pnpm only, with exact versions. Never relax the supply-chain policy in `pnpm-workspace.yaml`.
- **Pull requests.** Every change gets a branch and a squash-merged PR. There is no AI credit in commits or PRs. Bumping, release notes and `pnpm release` follow [README → Releasing](README.md#releasing).
