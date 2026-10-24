# testrail-cli

`testrail` is a small command-line tool for TestRail. Use it from the terminal or from CI, or let an AI agent use it instead of a TestRail MCP server, for far fewer tokens.

## Install

You need Node.js 24 or newer. To install the latest release, or update to it, run:

```sh
curl -fsSL https://raw.githubusercontent.com/chrisvasqm/testrail-cli/main/install.sh | sh
```

On Windows, run this in PowerShell:

```powershell
irm https://raw.githubusercontent.com/chrisvasqm/testrail-cli/main/install.ps1 | iex
```

The scripts ([sh](install.sh), [PowerShell](install.ps1)) check your Node.js version, download the latest release, verify its SHA-256 checksum, then install it with `npm install -g`. Each [release](https://github.com/chrisvasqm/testrail-cli/releases) also lists the command for that exact version.

To teach your AI agent (Claude Code, Codex, Cursor and others) to use the CLI, run:

```sh
npx skills add chrisvasqm/testrail-cli
```

## Set up

First, turn on the API in TestRail (Administration > Site Settings > API) and create an API key (My Settings > API Keys).

Then run `testrail setup` in the project directory. It asks for:

- your TestRail URL (`https://…`; a link copied from the browser works too);
- your TestRail email;
- the API key;
- a project, and a suite if the project has several.

It saves them to `.testrail-cli.json` with file mode 600. If that file already exists, it asks before replacing it (`--yes` skips the question). Add `--global` to save to `~/.config/testrail-cli/config.json` instead, or pass `--config <path>` to choose the file.

- Keep the file out of git, because it holds your API key. `setup` warns you when git does not ignore it.
- Each directory can have its own config, so different projects can use different TestRail sites or projects.

The CLI looks for a config in this order:

1. `--config <path>`;
2. the nearest `.testrail-cli.json`, walking up from the current directory;
3. the global file.

## Commands

Ids carry TestRail's letters: `C12` is a case, `R3` a run, `T45` a test (one case inside one run), `P2` a project and `S1` a suite. The letter is optional, except for `link`.

| Command                                | What it does                                                    |
| -------------------------------------- | --------------------------------------------------------------- |
| `testrail project list`                | Active projects; `*` marks yours                                |
| `testrail project use <P>`             | Make a project (and `--suite <S>`) the default                  |
| `testrail section list`                | Sections and their ids, nested                                  |
| `testrail case list`                   | Cases (`--section <id>`, `--limit <n>`, 50)                     |
| `testrail case view <C>`               | Fields, preconditions, steps and expected results               |
| `testrail case create`                 | New case (`--section` and `--title` are required)               |
| `testrail case edit <C>`               | Change only the fields you pass                                 |
| `testrail case delete <C>`             | Delete a case and its tests in active runs                      |
| `testrail run list`                    | Open runs, newest first (`--completed`, `--limit <n>`, 25)      |
| `testrail run view <R>`                | Progress per status, refs and description                       |
| `testrail run create`                  | New run with every case, or only `--cases C1,C2`                |
| `testrail run close <R>`               | Close a run (it cannot be reopened)                             |
| `testrail test list <R>`               | Tests in a run (`--status failed,retest`, `--limit <n>`, 100)   |
| `testrail test view <T>`               | Status, steps and latest results (`--results <0-100>`, 5)       |
| `testrail result add <T>`              | Add a result; or `--run <R> --case <C>` instead of a test       |
| `testrail result import <R> --file <>` | Add many results in one request from a JSON file (`-` is stdin) |
| `testrail link list <C\|R\|T>`         | Jira keys on a case or run (refs) or a test (result defects)    |
| `testrail link add <C\|R\|T> <KEY…>`   | Link Jira keys; checks them with jira-cli when installed        |
| `testrail link remove <C\|R> <KEY…>`   | Unlink Jira keys from a case or run                             |
| `testrail setup`                       | Create the config (see [Set up](#set-up))                       |

- **Case fields (`create` and `edit`):**
  - `--title`, `--type <name>`, `--priority <name>`, `--estimate 5m`
  - `--refs KAN-1,KAN-2` (replaces the refs)
  - `--preconds <text>`
  - `--steps <text>` and `--expected <text>` for the text template, or `--step "action::expected"` repeated for the steps template
- **Result fields:** `--status <name>`, `--comment <text>` or `--file <path>`, `--defects KAN-2`, `--elapsed "1m 30s"`, `--build 1.2.0`. A result needs a status or a comment (defects alone are refused). Results cannot be edited or deleted later.
- **`result import` file:** a JSON array such as `[{"case": "C1", "status": "passed", "elapsed": "45s"}, {"case": "C2", "status": "failed", "comment": "500 page", "defects": "KAN-2"}]`. Either all results land or none do.
- **Jira links:** `link` needs the id letter. `link add` checks new keys with [jira-cli](https://github.com/chrisvasqm/jira-cli) if `jira` is on your PATH (`--no-check` skips it). If jira-cli is not set up for the directory, it offers to run `jira setup` and then checks again. On a test, a link is a new result with no status, the comment "Linked KAN-1" and the key as a defect, so it cannot be removed.
- **Names** of statuses, types and priorities match TestRail's labels, ignoring case.
- **Deletes and `run close`** ask you to type "yes". `--yes` (`-y`) skips the question. With no terminal (scripts, agents), they fail with `CONFIRM_REQUIRED` unless you pass `--yes`.

Run `testrail <command> --help` for every option.

## Output

Every command prints readable text by default. Add `--json` to get one line on stdout:

- on success: `{ "ok": true, "data": … }`
- on failure: `{ "ok": false, "error": { "code", "message", "details" } }`

Exit codes:

- `0`: success
- `2`: bad usage or input
- `130`: cancelled with Ctrl+C
- `1`: any other error

The [agent skill](skills/testrail-cli/SKILL.md) lists the data shapes and every error code.

## Development

```sh
pnpm install
pnpm dev case list  # run from source
pnpm check          # type-check, bundle, lint, format check
pnpm add -g .       # once: use your local build as the global `testrail` (then `pnpm build` after changes)
```

[AGENTS.md](AGENTS.md) covers the layout and the repo rules.

## Releasing

Every feature or fix PR ships a release.

1. **Bump the version in the PR:**
   - `pnpm bump minor` for a new command or visible feature;
   - `pnpm bump patch` for fixes only;
   - `pnpm bump major` for a breaking change.
2. **Write a clear squash commit subject** (the PR title), such as "Add run close", and put its Spanish version in an `Es:` trailer of the squash commit body, such as `Es: Agrega run close` (`gh pr merge --squash --body "Es: …"`). The release notes have an English section built from the subjects and a Spanish section built from the trailers; a commit without a trailer repeats its English subject there.
3. **After the merge, run `pnpm release` on an up-to-date `main`**, before the next code PR merges. Docs-only merges in between are fine.
   - It needs `gh auth login` with push access.
   - It runs `pnpm check`, packs the CLI, tags the commit, and creates the GitHub release with notes built from the commit subjects, the checksum file `testrail-cli.tgz.sha256`, `testrail-cli-X.Y.Z.tgz` and `testrail-cli.tgz` (the latest-version link).
   - If it fails after tagging, fix the cause and run it again. A rerun also finishes a draft or partial release.
