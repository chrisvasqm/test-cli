# test-cli

`test-cli` is a small command-line tool for test management. It works with TestRail today, and is built so other providers (Qase, Xray) can follow. Use it from the terminal or from CI, or let an AI agent use it instead of a TestRail MCP server, for far fewer tokens.

The command is `test-cli`. Version 3 also installs `testrail` as an alias, so scripts from before the rename keep working.

## Install

You need Node.js 24 or newer. To install the latest release, or update to it, run:

```sh
curl -fsSL https://raw.githubusercontent.com/chrisvasqm/test-cli/main/install.sh | sh
```

On Windows, run this in PowerShell:

```powershell
irm https://raw.githubusercontent.com/chrisvasqm/test-cli/main/install.ps1 | iex
```

The scripts ([sh](install.sh), [PowerShell](install.ps1)) check your Node.js version, download the latest release, verify its SHA-256 checksum, then install it with `npm install -g`. Each [release](https://github.com/chrisvasqm/test-cli/releases) also lists the command for that exact version; coming from testrail-cli 2.x, run `npm uninstall -g testrail-cli` before that command (the install scripts do it for you).

To teach your AI agent (Claude Code, Codex, Cursor and others) to use the CLI, run:

```sh
npx skills add chrisvasqm/skills --skill test-cli
```

`npx skills add chrisvasqm/skills` adds every skill there, including the one for [jira-cli](https://github.com/chrisvasqm/jira-cli).

## Set up

First, turn on the API in TestRail (Administration > Site Settings > API) and create an API key (My Settings > API Keys).

Then run `test-cli setup` in the project directory. It asks for:

- your TestRail URL (`https://…`; a link copied from the browser works too);
- your TestRail email;
- the API key;
- a project, and a suite if the project has several.

It saves them to `.test-cli.json` with file mode 600 (configs from before 3.0.0, `.testrail-cli.json` and `~/.config/testrail-cli/config.json`, are still read, and `setup` in a directory that has only `.testrail-cli.json` rewrites that file). If that file already exists, it asks before replacing it (`--yes` skips the question). Add `--global` to save to `~/.config/test-cli/config.json` instead, or pass `--config <path>` to choose the file.

- Keep the file out of git, because it holds your API key. `setup` warns you when git does not ignore it.
- Each directory can have its own config, so different projects can use different TestRail sites or projects.

The CLI looks for a config in this order:

1. `--config <path>`;
2. the nearest `.test-cli.json`, walking up from the current directory;
3. the global file.

## Ask your agent

With the skill installed, describe the job in plain words and let the agent pick the commands. Some examples, with the commands the agent runs:

- **"Write test cases for KAN-12: a happy path and a wrong-password case."** It reads the ticket, picks a section and creates each case with steps, linked to the ticket.
  `jira ticket view KAN-12` → `test-cli section list` → `test-cli case create -sc 4 -t "Login with a valid password" -r KAN-12 -sa "Enter a valid email and password::The dashboard opens"`
- **"Start a test run for KAN-12."** A run named after the ticket with only the cases linked to it.
  `test-cli run create -fj KAN-12`
- **"Start a run for the current sprint."** The cases linked to the active sprint's tickets.
  `test-cli run create -w active`
- **"Which tickets in this sprint have no tests, and what is failing?"** Every sprint ticket with its linked cases and their latest results.
  `test-cli coverage`
- **"What failed in R3, and why?"** The failed and retest tests, then the latest results of each.
  `test-cli test list R3 -s failed,retest` → `test-cli test view T45 -n 3`
- **"T45 fails: the login page returns a 500. Mark it failed and file a bug."** One result with the comment, and a Jira bug linked as its defect.
  `test-cli result add T45 -s failed -m "Login returns 500" -cb`
- **"CI finished. Report results.json to R3."** Every result in one request; all land or none do.
  `test-cli result import R3 -f results.json`
- **"Which cases cover KAN-12? Is anything missing from the acceptance criteria?"** The linked cases, read next to the ticket.
  `test-cli case list -r KAN-12` → `test-cli case view C12` → `jira ticket view KAN-12`
- **"Link KAN-14 to C12 and C13."**
  `test-cli link add C12 KAN-14` → `test-cli link add C13 KAN-14`
- **"Rerun what failed in R3, assigned to me."** A new run with only R3's failed, retest and blocked cases.
  `test-cli run create -ru R3 -a me`
- **"T45 failed at step 2. Attach the screenshot."** Per-step statuses and the file on the same result.
  `test-cli result add T45 -s failed -sl 1:passed,2:failed -at login.png`
- **"Plan the 2.0 release: one run per browser."** A plan on the milestone, with one run per configuration.
  `test-cli milestone list` → `test-cli plan create -na "Release 2.0" -ml M3 -cf Chrome,Firefox`
- **"What has C12 done over the last runs?"** Its results across runs, newest first.
  `test-cli case history C12 -n 10`
- **"The sprint is over. Summarize R3 and close it."** Counts per status, then a close after you confirm.
  `test-cli run view R3` → `test-cli run close R3 -y`

Agents add `-j` to every command to read the JSON output. They never pass `-y` (delete or close) unless you asked for it.

## Commands

Ids carry TestRail's letters: `C12` is a case, `R3` a run, `T45` a test (one case inside one run), `P2` a project, `S1` a suite and `M3` a milestone. Test plans share run ids, so a plan is an `R` id too (`R7`); its runs work with `test list` and `result add` like any run. The letter is optional, except for `link`.

| Command                                 | What it does                                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test-cli project list`                 | Active projects; `*` marks yours                                                                                                                                                   |
| `test-cli project view [P]`             | Overview of yours or `P`: open runs and plans with counts and pass %, totals, open milestones (overdue flagged); `-n` per list                                                     |
| `test-cli project use <P>`              | Make a project (and `-su <S>`) the default                                                                                                                                         |
| `test-cli suite list`                   | Suites in your project; `*` marks yours                                                                                                                                            |
| `test-cli suite view <S>`               | Name, description, state and URL                                                                                                                                                   |
| `test-cli suite create`                 | New suite (`-na <name>`, `-d <text>` or `-f <file>`); multi-suite projects only                                                                                                    |
| `test-cli suite edit <S>`               | Change the name (`-na`) or description (`-d`, `-f`)                                                                                                                                |
| `test-cli suite delete <S>`             | Delete a suite with its sections, cases and tests                                                                                                                                  |
| `test-cli section list`                 | Sections and their ids, nested                                                                                                                                                     |
| `test-cli section create`               | New section (`-na <name>`, `-pa <parent>`, `-d <text>` or `-f <file>`)                                                                                                             |
| `test-cli section edit <id>`            | Rename (`-na`) or change the description (`-d`, `-f`)                                                                                                                              |
| `test-cli section move <id>`            | Move under `-pa <parent>` (or `top`) and/or after `-af <sibling>` (or `first`)                                                                                                     |
| `test-cli section delete <id>`          | Delete a section, its child sections and all their cases                                                                                                                           |
| `test-cli case list`                    | Cases (`-sc <section>`, `-r KAN-12`, `-q <text>`, `-p High`, `-ty <type>`, `-u <date>`, `-n <limit>`, 50)                                                                          |
| `test-cli case view <C>`                | Fields, preconditions, steps and expected results                                                                                                                                  |
| `test-cli case history <C>`             | Results across the latest runs, newest first (`-rn <runs>`, 25; `-n <limit>`, 20; or `-ru <R>`)                                                                                    |
| `test-cli case create`                  | New case (`-sc <section>`, and `-t <title>` or `-fj KAN-12`)                                                                                                                       |
| `test-cli case edit <C…>`               | Change only the fields you pass; with several cases, only `-ty`, `-p`, `-r`, `-es`                                                                                                 |
| `test-cli case copy <C…> -sc <section>` | Copy cases into a section                                                                                                                                                          |
| `test-cli case move <C…> -sc <section>` | Move cases into a section (same suite)                                                                                                                                             |
| `test-cli case delete <C>`              | Delete a case and its tests in active runs                                                                                                                                         |
| `test-cli run list`                     | Open runs, newest first (`-cp` for closed, `-n <limit>`, 25)                                                                                                                       |
| `test-cli run view <R>`                 | Progress per status, refs and description                                                                                                                                          |
| `test-cli run create`                   | New run with every case, `-ca C1,C2`, `-fj KAN-12`, `-w <sprint>` or `-ep <epic>`; `-ru R3` reruns R3's failed, retest and blocked tests (`-s` picks statuses); `-a me` assigns it |
| `test-cli run edit <R>`                 | Change an open run, in a plan too (`-na`, `-d`, `-r`, `-ml M3`, `-a me`); cases: `-i C4` adds, `-x C3` removes, `-ca C1,C2` sets                                                   |
| `test-cli run close <R>`                | Close a run (it cannot be reopened); a run in a plan closes only with its plan                                                                                                     |
| `test-cli run delete <R>`               | Delete a run, its tests and results (closed runs need permission)                                                                                                                  |
| `test-cli run retest <R>`               | Back to Retest: failed and blocked tests whose Jira bugs (defects) are all Done (`-s` statuses, `-dn` done statuses)                                                               |
| `test-cli run sync <R>`                 | Comment the run's results on its linked Jira tickets (a key linked by cases: their tests; otherwise a run ref: all tests); `-mv Done` also moves fully passed tickets              |
| `test-cli plan list`                    | Open test plans, newest first (`-cp` for closed, `-n <limit>`, 25)                                                                                                                 |
| `test-cli plan view <R>`                | Progress per status, milestone, and each entry's runs with configurations                                                                                                          |
| `test-cli plan create`                  | New plan (`-na <name>`; `-d`/`-f`, `-ml <M>`); run flags as in `add-run` add its first runs                                                                                        |
| `test-cli plan add-run <R>`             | Add runs (`-su <S>`, `-na`, `-ca C1,C2` or `-fj KAN-12`, `-a me`, `-cf Chrome,Windows`: one run per combination)                                                                   |
| `test-cli plan close <R>`               | Close a plan and its runs (it cannot be reopened)                                                                                                                                  |
| `test-cli plan delete <R>`              | Delete a plan with its runs, tests and results                                                                                                                                     |
| `test-cli milestone list`               | Open milestones with due dates (`-cp` for completed, `-n <limit>`, 25)                                                                                                             |
| `test-cli milestone view <M>`           | Dates, parent, refs and description                                                                                                                                                |
| `test-cli milestone create`             | New milestone (`-na <name>`; `-d`/`-f`, `-sd`/`-du` start/due dates, `-pa <M>` parent, `-r`)                                                                                       |
| `test-cli milestone edit <M>`           | Change the fields given (`-na`, `-d`/`-f`, `-sd`/`-du`, `-pa <M>` parent, `-r`); `-sr` marks it started (`-sd` makes it upcoming again)                                            |
| `test-cli milestone close <M>`          | Mark it completed                                                                                                                                                                  |
| `test-cli milestone reopen <M>`         | Mark a completed milestone open again                                                                                                                                              |
| `test-cli milestone delete <M>`         | Delete a milestone (its sub-milestones stay, without a parent)                                                                                                                     |
| `test-cli test list <R>`                | Tests in a run (`-s failed,retest`, `-a me`, `-n <limit>`, 100)                                                                                                                    |
| `test-cli test todo`                    | Your To-Do: tests assigned to you, not done (Untested, Retest), in open runs and plans (`-a <user>`, `-s`, `-ml <M>`, `-n <limit>`, 100)                                           |
| `test-cli test view <T>`                | Status, steps and latest results (`-n <0-100>` results, 5)                                                                                                                         |
| `test-cli result add <T>`               | Add a result (`-sl 1:passed,2:failed` step statuses, `-at <file>` attaches, `-cb` files a Jira bug, `-a me` reassigns); or `-ru <R> -ca <C>`                                       |
| `test-cli result import <R> -f <file>`  | Add many results in one request from a JSON file (`-` is stdin)                                                                                                                    |
| `test-cli link list <C\|R\|T\|KEY>`     | Jira keys on a case or run (refs) or a test (result defects); with a Jira key, the cases and runs linked to it                                                                     |
| `test-cli link add <C\|R\|T> <KEY…>`    | Link Jira keys; checks them with jira-cli when installed                                                                                                                           |
| `test-cli link remove <C\|R> <KEY…>`    | Unlink Jira keys from a case or run                                                                                                                                                |
| `test-cli coverage`                     | Jira tickets of a sprint (`-w`, default the active one), epic (`-ep`) or JQL (`-ql`): their linked cases and each case's latest result (`-rn` runs to read)                        |
| `test-cli configuration list`           | Configuration groups (e.g. browsers, OS) and their ids                                                                                                                             |
| `test-cli report list`                  | On-demand report templates (made in the UI with "On-demand via the API")                                                                                                           |
| `test-cli report run <id>`              | Run a report template; prints its URL, HTML and PDF links                                                                                                                          |
| `test-cli user list`                    | Users in the project (id, name, email); `*` marks you                                                                                                                              |
| `test-cli attachment list <C\|R\|T>`    | Files on a case, a run, or a test's results (`-n <limit>`, 100)                                                                                                                    |
| `test-cli attachment add <C\|R\|T> …`   | Attach files (256 MB each); a test's go to its newest result or `-rs <result id>`; also `result add -at`                                                                           |
| `test-cli setup`                        | Create the config (see [Set up](#set-up))                                                                                                                                          |

- **Case fields (`create` and `edit`):**
  - `-t --title`, `-ty --type <name>`, `-p --priority <name>`, `-es --estimate 5m`
  - `-r --refs KAN-1,KAN-2` (replaces the refs)
  - `-pc --preconds <text>`
  - `-sp --steps <text>` and `-ex --expected <text>` for the text template, or `-sa --step "action::expected"` repeated for the steps template
- **Result fields:** `-s --status <name>`, `-m --comment <text>` or `-f --file <path>`, `-df --defects KAN-2`, `-e --elapsed "1m 30s"`, `-b --build 1.2.0`, `-sl --steps 1:passed,2:failed` (Steps-template cases: step numbers as `test view` shows them, steps not given are Untested; `STEP_INVALID` for a bad step, `NO_STEPS` when the case has no separated steps); `-ru --run` and `-ca --case` instead of a test id; `-cb --create-bug`. A result needs a status or a comment (defects alone are refused). Results cannot be edited or deleted later.
- **`result import` file:** a JSON array such as `[{"case": "C1", "status": "passed", "elapsed": "45s"}, {"case": "C2", "status": "failed", "comment": "500 page", "defects": "KAN-2", "assign": "me"}]`. `assign` takes `me`, an email or a user id. An entry can add `"steps": [{"step": 2, "status": "failed", "actual": "500 page"}]` for per-step statuses and actual results. Either all results land or none do.
- **From Jira** (needs [jira-cli](https://github.com/chrisvasqm/jira-cli)): `case create --from-jira KAN-12` takes the title from the ticket's summary and puts the key in refs. `run create --from-jira KAN-12` names the run "KAN-12: summary", puts the key in refs and, without `--cases`, runs only the cases linked to KAN-12. `run create --from-sprint <sprint>` (`active`, an id or a name, on jira-cli's board) and `run create --from-epic KAN-5` run the cases linked to the sprint's tickets or to the epic's children (done ones too, in jira-cli's project). The run is named after the sprint, or "KAN-5: summary", and its refs get the tickets that have linked cases, as many as fit TestRail's 250 characters. Each stands alone: not with `--from-jira`, `--from-run` or `--cases`. No linked case fails with `NO_LINKED_CASES`, an unknown sprint name with `SPRINT_NOT_FOUND`. `result add --create-bug` (only with `-s failed` or `-s blocked`, else `USAGE`) creates a Jira Bug named "T45 failed: title" (or "T45 blocked: title") (the comment and a link to the test are its description; a Task when the project has no Bug type) and adds its key to the result's defects.
- **`run retest`** (needs [jira-cli](https://github.com/chrisvasqm/jira-cli)): for each test in the run with a `-s --status` (default `failed,blocked`), it reads the Jira keys in the defects of the test's latest results with that status (an older pass or retest ends the list). Each key is looked up once. When every bug's Jira status is in Jira's Done category (with a jira-cli that reports `statusCategory`) or is one of `-dn --done` (default `Done`, ignoring case), the test gets a Retest result with the comment "Retest: KAN-12 is Done" and the keys as defects, all in one request. Other tests are listed as waiting (a bug not done), without a Jira bug, or as errors (`JIRA_TICKET_NOT_FOUND`: a key Jira does not have; that test is not retested). It asks first; `-y` skips the question.
- **`coverage`** (needs [jira-cli](https://github.com/chrisvasqm/jira-cli), read-only) takes the tickets of `-w --sprint` (`active`, an id or a name; the active sprint when nothing is given), `-ep --epic` (its children) or `-ql --jql` (one of them; done tickets included, in jira-cli's project), and the cases linked to each (refs). A case's latest result is its test's status in the newest of the latest `-rn --runs` runs (default 25, open and closed, by creation; runs inside plans are not read) where it is not Untested; none means untested. Calls stay bounded: one Jira search, one sweep of the cases, one `get_runs`, and one `get_tests` per run, stopping once every case has a result. The summary counts tickets (covered or not) and cases (passed, failed, untested, other). With `--json`: `{source: {from, name, jql}, tickets: [{key, summary, status, cases: [{id, title, latest: {status, runId, testId} | null}]}], summary: {tickets, covered, uncovered, cases, passed, failed, untested, other}, runsScanned, moreRuns}`.
- **`run sync`** (needs [jira-cli](https://github.com/chrisvasqm/jira-cli)) posts one comment per Jira key found in the run's refs (covering every test) and in its cases' refs (covering that case's tests): tests passed out of the total, counts per status, the failed, blocked and retest tests by T id and title, and the run URL. `-mv --move <status>` also moves a ticket whose related tests all passed (untested tests hold it back too; a ticket already in that status is left alone). It lists the tickets and asks first; `-y` skips the question. A run with no Jira keys fails with `NO_JIRA_KEYS`. When Jira refuses some tickets the others are still synced and the command fails with `SYNC_FAILED`, listing each ticket's result; rerunning comments again on the ones that worked.
- **Runs in plans:** `run edit` and `link add|remove` change them through their plan entry. TestRail sets their milestone on the plan and closes them only with it, so `run edit -ml`, `run close` and renaming a run that has sibling configuration runs fail with `RUN_IN_PLAN`.
- **`project view`** (read-only) covers the whole project, every suite. Runs inside plans count in their plan. Pass % is passed tests ÷ all tests (untested included), rounded; the totals add up the runs and plans listed, so `-n` (default 25 each) can leave some out (`hasMore` says so). An unknown project fails with `PROJECT_NOT_FOUND`. TestRail's API has no activity feed, so there is no recent-activity view.
- **Jira links:** `link` needs the id letter. `link add` checks new keys with [jira-cli](https://github.com/chrisvasqm/jira-cli) if `jira` is on your PATH (`--no-check` skips it). If jira-cli is not set up for the directory, it offers to run `jira setup` and then checks again. On a test, a link is a new result with no status, the comment "Linked KAN-1" and the key as a defect, so it cannot be removed.
- **Names** of statuses, types and priorities match TestRail's labels, ignoring case.
- **Deletes, `run close`, `run sync`, `run retest` and `plan close`** ask you to type "yes". `--yes` (`-y`) skips the question. With no terminal (scripts, agents), they fail with `CONFIRM_REQUIRED` unless you pass `--yes`.

Every option has a short form, lowercase only. A letter means one thing across commands: `-n` is how many (`--limit`, `--results`), `-f` reads text from a file, `-r` is refs, `-s` is a status, `-a` is an assignee (`me`, an email or a user id), `-w` a sprint, `-y` is `--yes`. When a letter is taken, a later option gets two letters: `-sc` section, `-pa` parent, `-na` name, `-cp` closed or completed, `-fj` `--from-jira`, `-ep` an epic, `-ql` JQL, `-rn` how many recent runs to read, `-ca`/`-ru`/`-su`/`-ml` case, run, suite and milestone ids. Combined short flags (`-yj`) are not supported. Run `test-cli <command> --help` for every option.

## Output

Every command prints readable text by default. Add `--json` (`-j`) to get one line on stdout:

- on success: `{ "ok": true, "data": … }`
- on failure: `{ "ok": false, "error": { "code", "message", "details" } }`

Exit codes:

- `0`: success
- `2`: bad usage or input
- `130`: cancelled with Ctrl+C
- `1`: any other error

`NOT_SUPPORTED` (exit 2) means the configured provider lacks the feature (for example milestones). TestRail supports every command.

The [agent skill](https://github.com/chrisvasqm/skills/blob/main/skills/test-cli/SKILL.md) lists the data shapes and every error code.

## Development

```sh
pnpm install
pnpm dev case list  # run from source
pnpm check          # type-check, bundle, lint, format check
pnpm add -g .       # once: use your local build as the global `test-cli` (then `pnpm build` after changes)
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
   - It runs `pnpm check`, packs the CLI, tags the commit, and creates the GitHub release with notes built from the commit subjects, the checksum file `test-cli.tgz.sha256`, `test-cli-X.Y.Z.tgz` and `test-cli.tgz` (the latest-version link).
   - If it fails after tagging, fix the cause and run it again. A rerun also finishes a draft or partial release.
