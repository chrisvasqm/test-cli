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
npx skills add chrisvasqm/skills --skill testrail-cli
```

`npx skills add chrisvasqm/skills` adds every skill there, including the one for [jira-cli](https://github.com/chrisvasqm/jira-cli).

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

## Ask your agent

With the skill installed, describe the job in plain words and let the agent pick the commands. Some examples, with the commands the agent runs:

- **"Write test cases for KAN-12: a happy path and a wrong-password case."** It reads the ticket, picks a section and creates each case with steps, linked to the ticket.
  `jira ticket view KAN-12` → `testrail section list` → `testrail case create -s 4 -t "Login with a valid password" -r KAN-12 -a "Enter a valid email and password::The dashboard opens"`
- **"Start a test run for KAN-12."** A run named after the ticket with only the cases linked to it.
  `testrail run create -J KAN-12`
- **"Start a run for the current sprint."** The cases linked to the active sprint's tickets.
  `testrail run create -w active`
- **"Which tickets in this sprint have no tests, and what is failing?"** Every sprint ticket with its linked cases and their latest results.
  `testrail coverage`
- **"What failed in R3, and why?"** The failed and retest tests, then the latest results of each.
  `testrail test list R3 -s failed,retest` → `testrail test view T45 -n 3`
- **"T45 fails: the login page returns a 500. Mark it failed and file a bug."** One result with the comment, and a Jira bug linked as its defect.
  `testrail result add T45 -s failed -m "Login returns 500" -B`
- **"CI finished. Report results.json to R3."** Every result in one request; all land or none do.
  `testrail result import R3 -f results.json`
- **"Which cases cover KAN-12? Is anything missing from the acceptance criteria?"** The linked cases, read next to the ticket.
  `testrail case list -r KAN-12` → `testrail case view C12` → `jira ticket view KAN-12`
- **"Link KAN-14 to C12 and C13."**
  `testrail link add C12 KAN-14` → `testrail link add C13 KAN-14`
- **"Rerun what failed in R3, assigned to me."** A new run with only R3's failed, retest and blocked cases.
  `testrail run create -R R3 -a me`
- **"T45 failed at step 2. Attach the screenshot."** Per-step statuses and the file on the same result.
  `testrail result add T45 -s failed -O 1:passed,2:failed -A login.png`
- **"Plan the 2.0 release: one run per browser."** A plan on the milestone, with one run per configuration.
  `testrail milestone list` → `testrail plan create -N "Release 2.0" -M M3 -g Chrome,Firefox`
- **"What has C12 done over the last runs?"** Its results across runs, newest first.
  `testrail case history C12 -n 10`
- **"The sprint is over. Summarize R3 and close it."** Counts per status, then a close after you confirm.
  `testrail run view R3` → `testrail run close R3 -y`

Agents add `-j` to every command to read the JSON output. They never pass `-y` (delete or close) unless you asked for it.

## Commands

Ids carry TestRail's letters: `C12` is a case, `R3` a run, `T45` a test (one case inside one run), `P2` a project, `S1` a suite and `M3` a milestone. Test plans share run ids, so a plan is an `R` id too (`R7`); its runs work with `test list` and `result add` like any run. The letter is optional, except for `link`.

| Command                                | What it does                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `testrail project list`                | Active projects; `*` marks yours                                                                                                                                               |
| `testrail project use <P>`             | Make a project (and `-S <S>`) the default                                                                                                                                      |
| `testrail suite list`                  | Suites in your project; `*` marks yours                                                                                                                                        |
| `testrail suite view <S>`              | Name, description, state and URL                                                                                                                                               |
| `testrail suite create`                | New suite (`-N <name>`, `-d <text>` or `-f <file>`); multi-suite projects only                                                                                                 |
| `testrail suite edit <S>`              | Change the name (`-N`) or description (`-d`, `-f`)                                                                                                                             |
| `testrail suite delete <S>`            | Delete a suite with its sections, cases and tests                                                                                                                              |
| `testrail section list`                | Sections and their ids, nested                                                                                                                                                 |
| `testrail section create`              | New section (`-N <name>`, `-s <parent>`, `-d <text>` or `-f <file>`)                                                                                                           |
| `testrail section edit <id>`           | Rename (`-N`) or change the description (`-d`, `-f`)                                                                                                                           |
| `testrail section move <id>`           | Move under `-s <parent>` (or `top`) and/or after `-L <sibling>` (or `first`)                                                                                                   |
| `testrail section delete <id>`         | Delete a section, its child sections and all their cases                                                                                                                       |
| `testrail case list`                   | Cases (`-s <section>`, `-r KAN-12`, `-q <text>`, `-p High`, `-T <type>`, `-u <date>`, `-n <limit>`, 50)                                                                        |
| `testrail case view <C>`               | Fields, preconditions, steps and expected results                                                                                                                              |
| `testrail case history <C>`            | Results across the latest runs, newest first (`-W <runs>`, 25; `-n <limit>`, 20; or `-R <R>`)                                                                                  |
| `testrail case create`                 | New case (`-s <section>`, and `-t <title>` or `-J KAN-12`)                                                                                                                     |
| `testrail case edit <C…>`              | Change only the fields you pass; with several cases, only `-T`, `-p`, `-r`, `-e`                                                                                               |
| `testrail case copy <C…> -s <section>` | Copy cases into a section                                                                                                                                                      |
| `testrail case move <C…> -s <section>` | Move cases into a section (same suite)                                                                                                                                         |
| `testrail case delete <C>`             | Delete a case and its tests in active runs                                                                                                                                     |
| `testrail run list`                    | Open runs, newest first (`-D` for closed, `-n <limit>`, 25)                                                                                                                    |
| `testrail run view <R>`                | Progress per status, refs and description                                                                                                                                      |
| `testrail run create`                  | New run with every case, `-C C1,C2`, `-J KAN-12`, `-w <sprint>` or `-K <epic>`; `-R R3` reruns R3's failed, retest and blocked tests (`-s` picks statuses); `-a me` assigns it |
| `testrail run edit <R>`                | Change an open run (`-N`, `-d`, `-r`, `-M M3`, `-a me`); cases: `-i C4` adds, `-x C3` removes, `-C C1,C2` sets                                                                 |
| `testrail run close <R>`               | Close a run (it cannot be reopened)                                                                                                                                            |
| `testrail run delete <R>`              | Delete a run, its tests and results (closed runs need permission)                                                                                                              |
| `testrail run retest <R>`              | Back to Retest: failed and blocked tests whose Jira bugs (defects) are all Done (`-s` statuses, `-o` done statuses)                                                            |
| `testrail run sync <R>`                | Comment the run's results on its linked Jira tickets (a key linked by cases: their tests; otherwise a run ref: all tests); `-o Done` also moves fully passed tickets           |
| `testrail plan list`                   | Open test plans, newest first (`-D` for closed, `-n <limit>`, 25)                                                                                                              |
| `testrail plan view <R>`               | Progress per status, milestone, and each entry's runs with configurations                                                                                                      |
| `testrail plan create`                 | New plan (`-N <name>`; `-d`/`-f`, `-M <M>`); run flags as in `add-run` add its first runs                                                                                      |
| `testrail plan add-run <R>`            | Add runs (`-S <S>`, `-N`, `-C C1,C2` or `-J KAN-12`, `-a me`, `-g Chrome,Windows`: one run per combination)                                                                    |
| `testrail plan close <R>`              | Close a plan and its runs (it cannot be reopened)                                                                                                                              |
| `testrail plan delete <R>`             | Delete a plan with its runs, tests and results                                                                                                                                 |
| `testrail milestone list`              | Open milestones with due dates (`-D` for completed, `-n <limit>`, 25)                                                                                                          |
| `testrail milestone view <M>`          | Dates, parent, refs and description                                                                                                                                            |
| `testrail milestone create`            | New milestone (`-N <name>`; `-d`/`-f`, `-F`/`-U` start/due dates, `-M <M>` parent, `-r`)                                                                                       |
| `testrail milestone edit <M>`          | Change the fields given (`-N`, `-d`/`-f`, `-F`/`-U`, `-M <M>`, `-r`); `-G` marks it started (`-F` makes it upcoming again)                                                     |
| `testrail milestone close <M>`         | Mark it completed                                                                                                                                                              |
| `testrail milestone reopen <M>`        | Mark a completed milestone open again                                                                                                                                          |
| `testrail milestone delete <M>`        | Delete a milestone (its sub-milestones stay, without a parent)                                                                                                                 |
| `testrail test list <R>`               | Tests in a run (`-s failed,retest`, `-a me`, `-n <limit>`, 100)                                                                                                                |
| `testrail test view <T>`               | Status, steps and latest results (`-n <0-100>` results, 5)                                                                                                                     |
| `testrail result add <T>`              | Add a result (`-O 1:passed,2:failed` step statuses, `-A <file>` attaches, `-B` files a Jira bug, `-a me` reassigns); or `-R <R> -C <C>`                                        |
| `testrail result import <R> -f <file>` | Add many results in one request from a JSON file (`-` is stdin)                                                                                                                |
| `testrail link list <C\|R\|T\|KEY>`    | Jira keys on a case or run (refs) or a test (result defects); with a Jira key, the cases and runs linked to it                                                                 |
| `testrail link add <C\|R\|T> <KEY…>`   | Link Jira keys; checks them with jira-cli when installed                                                                                                                       |
| `testrail link remove <C\|R> <KEY…>`   | Unlink Jira keys from a case or run                                                                                                                                            |
| `testrail coverage`                    | Jira tickets of a sprint (`-w`, default the active one), epic (`-K`) or JQL (`-Q`): their linked cases and each case's latest result (`-W` runs to read)                       |
| `testrail configuration list`          | Configuration groups (e.g. browsers, OS) and their ids                                                                                                                         |
| `testrail report list`                 | On-demand report templates (made in the UI with "On-demand via the API")                                                                                                       |
| `testrail report run <id>`             | Run a report template; prints its URL, HTML and PDF links                                                                                                                      |
| `testrail user list`                   | Users in the project (id, name, email); `*` marks you                                                                                                                          |
| `testrail attachment list <C\|R\|T>`   | Files on a case, a run, or a test's results (`-n <limit>`, 100)                                                                                                                |
| `testrail attachment add <C\|R\|T> …`  | Attach files (256 MB each); a test's go to its newest result or `-I <result id>`; also `result add -A`                                                                         |
| `testrail setup`                       | Create the config (see [Set up](#set-up))                                                                                                                                      |

- **Case fields (`create` and `edit`):**
  - `-t --title`, `-T --type <name>`, `-p --priority <name>`, `-e --estimate 5m`
  - `-r --refs KAN-1,KAN-2` (replaces the refs)
  - `-P --preconds <text>`
  - `-S --steps <text>` and `-E --expected <text>` for the text template, or `-a --step "action::expected"` repeated for the steps template
- **Result fields:** `-s --status <name>`, `-m --comment <text>` or `-f --file <path>`, `-d --defects KAN-2`, `-e --elapsed "1m 30s"`, `-b --build 1.2.0`, `-O --steps 1:passed,2:failed` (Steps-template cases: step numbers as `test view` shows them, steps not given are Untested; `STEP_INVALID` for a bad step, `NO_STEPS` when the case has no separated steps); `-R --run` and `-C --case` instead of a test id; `-B --create-bug`. A result needs a status or a comment (defects alone are refused). Results cannot be edited or deleted later.
- **`result import` file:** a JSON array such as `[{"case": "C1", "status": "passed", "elapsed": "45s"}, {"case": "C2", "status": "failed", "comment": "500 page", "defects": "KAN-2", "assign": "me"}]`. `assign` takes `me`, an email or a user id. An entry can add `"steps": [{"step": 2, "status": "failed", "actual": "500 page"}]` for per-step statuses and actual results. Either all results land or none do.
- **From Jira** (needs [jira-cli](https://github.com/chrisvasqm/jira-cli)): `case create --from-jira KAN-12` takes the title from the ticket's summary and puts the key in refs. `run create --from-jira KAN-12` names the run "KAN-12: summary", puts the key in refs and, without `--cases`, runs only the cases linked to KAN-12. `run create --from-sprint <sprint>` (`active`, an id or a name, on jira-cli's board) and `run create --from-epic KAN-5` run the cases linked to the sprint's tickets or to the epic's children (done ones too, in jira-cli's project). The run is named after the sprint, or "KAN-5: summary", and its refs get the tickets that have linked cases, as many as fit TestRail's 250 characters. Each stands alone: not with `--from-jira`, `--from-run` or `--cases`. No linked case fails with `NO_LINKED_CASES`, an unknown sprint name with `SPRINT_NOT_FOUND`. `result add --create-bug` creates a Jira Bug named "T45 failed: title" (the comment and a link to the test are its description; a Task when the project has no Bug type) and adds its key to the result's defects.
- **`run retest`** (needs [jira-cli](https://github.com/chrisvasqm/jira-cli)): for each test in the run with a `-s --status` (default `failed,blocked`), it reads the Jira keys in the defects of the test's latest results with that status (an older pass or retest ends the list). Each key is looked up once. When every bug's Jira status is in Jira's Done category (with a jira-cli that reports `statusCategory`) or is one of `-o --done` (default `Done`, ignoring case), the test gets a Retest result with the comment "Retest: KAN-12 is Done" and the keys as defects, all in one request. Other tests are listed as waiting (a bug not done), without a Jira bug, or as errors (`JIRA_TICKET_NOT_FOUND`: a key Jira does not have; that test is not retested). It asks first; `-y` skips the question.
- **`coverage`** (needs [jira-cli](https://github.com/chrisvasqm/jira-cli), read-only) takes the tickets of `-w --sprint` (`active`, an id or a name; the active sprint when nothing is given), `-K --epic` (its children) or `-Q --jql` (one of them; done tickets included, in jira-cli's project), and the cases linked to each (refs). A case's latest result is its test's status in the newest of the latest `-W --runs` runs (default 25, open and closed, by creation; runs inside plans are not read) where it is not Untested; none means untested. Calls stay bounded: one Jira search, one sweep of the cases, one `get_runs`, and one `get_tests` per run, stopping once every case has a result. The summary counts tickets (covered or not) and cases (passed, failed, untested, other). With `--json`: `{source: {from, name, jql}, tickets: [{key, summary, status, cases: [{id, title, latest: {status, runId, testId} | null}]}], summary: {tickets, covered, uncovered, cases, passed, failed, untested, other}, runsScanned, moreRuns}`.
- **`run sync`** (needs [jira-cli](https://github.com/chrisvasqm/jira-cli)) posts one comment per Jira key found in the run's refs (covering every test) and in its cases' refs (covering that case's tests): tests passed out of the total, counts per status, the failed, blocked and retest tests by T id and title, and the run URL. `-o --move <status>` also moves a ticket whose related tests all passed (untested tests hold it back too; a ticket already in that status is left alone). It lists the tickets and asks first; `-y` skips the question. A run with no Jira keys fails with `NO_JIRA_KEYS`. When Jira refuses some tickets the others are still synced and the command fails with `SYNC_FAILED`, listing each ticket's result; rerunning comments again on the ones that worked.
- **Jira links:** `link` needs the id letter. `link add` checks new keys with [jira-cli](https://github.com/chrisvasqm/jira-cli) if `jira` is on your PATH (`--no-check` skips it). If jira-cli is not set up for the directory, it offers to run `jira setup` and then checks again. On a test, a link is a new result with no status, the comment "Linked KAN-1" and the key as a defect, so it cannot be removed.
- **Names** of statuses, types and priorities match TestRail's labels, ignoring case.
- **Deletes, `run close`, `plan close` and `run retest`** ask you to type "yes". `--yes` (`-y`) skips the question. With no terminal (scripts, agents), they fail with `CONFIRM_REQUIRED` unless you pass `--yes`.
- **Deletes, `run close`, `run sync` and `plan close`** ask you to type "yes". `--yes` (`-y`) skips the question. With no terminal (scripts, agents), they fail with `CONFIRM_REQUIRED` unless you pass `--yes`.

Every option has a short form. The same letter means the same thing across commands: `-n` is how many (`--limit`, `--results`), `-f` reads text from a file, `-r` is refs, `-s` is a status or a section, `-N` is a name, `-a` is an assignee (`me`, an email or a user id; on `case create`/`edit` it is a step), `-D` shows closed or completed items, `-J` is `--from-jira`, `-w` a sprint, `-K` an epic, `-Q` JQL, `-W` how many recent runs to read, `-y` is `--yes`, and uppercase `-C`/`-R`/`-S`/`-M` take case, run, suite and milestone ids. Run `testrail <command> --help` for every option.

## Output

Every command prints readable text by default. Add `--json` (`-j`) to get one line on stdout:

- on success: `{ "ok": true, "data": … }`
- on failure: `{ "ok": false, "error": { "code", "message", "details" } }`

Exit codes:

- `0`: success
- `2`: bad usage or input
- `130`: cancelled with Ctrl+C
- `1`: any other error

The [agent skill](https://github.com/chrisvasqm/skills/blob/main/skills/testrail-cli/SKILL.md) lists the data shapes and every error code.

## Development

```sh
pnpm install
pnpm dev case list  # run from source
pnpm check          # type-check, bundle, lint, format check
pnpm add -g .       # once: use your local build as the global `testrail` (then `pnpm build` after changes)
```

[AGENTS.md](AGENTS.md) covers the layout and the repo rules. `pnpm regression` runs every command with short flags against your configured TestRail project; it deletes the case it creates and leaves its closed runs, plan and milestone as evidence. Jira features go through the real `jira` CLI: it creates throwaway tickets in its configured project and deletes them when the run ends, even on Ctrl+C.

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
