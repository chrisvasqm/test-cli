#!/usr/bin/env node
// Live regression run against the configured TestRail project: creates its own case and run,
// exercises every command on them with short flags only, then deletes the case and closes the run.
// Needs a config (testrail setup) pointing at a throwaway project. usage: pnpm regression
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
let failures = 0;

// Jira is the real `jira` CLI on PATH, against its configured project: the run creates its own
// tickets (tagged with `tag`) and deletes them, and every bug it files, when it exits.
const tag = `rg${Date.now()}`;
const tickets = [];

/** Runs `jira --json …`; returns the parsed JSON line. */
function jira(...args) {
  try {
    return parseLine(
      execFileSync("jira", ["--json", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    );
  } catch (err) {
    return parseLine(err.stdout ?? "");
  }
}

function ticket(summary) {
  const key = jira(
    "ticket",
    "create",
    "--summary",
    summary,
    "--description",
    "Created by testrail-cli regression",
  ).data?.key;
  if (!key) throw new Error("jira ticket create failed; is jira-cli set up for this directory?");
  tickets.push(key);
  return key;
}

/** How many tickets carry this run's tag (bugs are named after the tagged case titles). */
const tagged = () =>
  jira("board", "view", "--sprint", "all", "--jql", `summary ~ "${tag}"`).data?.total ?? -1;

process.on("exit", () => {
  for (const key of tickets) jira("ticket", "delete", key, "--yes");
  console.log(`deleted Jira tickets: ${tickets.join(", ") || "none"}`);
});

const story = `Regression ${tag} story (delete me)`;
const K1 = ticket(`Regression ${tag} one (delete me)`);
const K2 = ticket(story);
const missing = `${K1.split("-")[0]}-999999`;

/** Runs `testrail --json …`; returns { code, out } where out is the parsed JSON line. */
function run(...args) {
  try {
    const stdout = execFileSync("node", [cli, "-j", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out: parseLine(stdout) };
  } catch (err) {
    return { code: err.status, out: parseLine(err.stdout ?? "") };
  }
}

/** A crash can leave non-JSON on stdout; keep it as a failure instead of aborting before cleanup. */
function parseLine(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, raw: text.slice(0, 300) };
  }
}

function check(name, result, expect) {
  let ok = false;
  try {
    ok = Boolean(expect(result));
  } catch {
    // A missing field in an unexpected answer is a failed check, not a crash: cleanup still runs.
  }
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `  ${JSON.stringify(result.out)}`}`);
  return result.out?.data;
}

const okData = (result) => result.code === 0 && result.out.ok === true;
const errCode = (code, exit) => (result) => result.code === exit && result.out.error?.code === code;

const sections = check(
  "section list",
  run("section", "list"),
  (res) => okData(res) && res.out.data.sections.length > 0,
);
const sectionId = String(sections?.sections[0]?.id ?? 0);
const created = check(
  "case create (steps)",
  run(
    "case",
    "create",
    "-s",
    sectionId,
    "-t",
    `Regression ${tag}`,
    "-p",
    "high",
    "-r",
    K1,
    "-a",
    "Do a::See b",
    "-a",
    "Do c::See d",
  ),
  okData,
);
const caseRef = `C${created?.id}`;
check("case view", run("case", "view", caseRef), (res) => okData(res) && res.out.data.stepList.length === 2);
check(
  "case edit",
  run("case", "edit", caseRef, "-p", "low", "-e", "2m", "-T", "Functional", "-P", "Logged out"),
  okData,
);
check(
  "case list",
  run("case", "list", "-s", sectionId, "-n", "250"),
  (res) =>
    okData(res) && res.out.data.cases.some((item) => item.id === created?.id && item.priority === "Low"),
);
check(
  "case list --refs",
  run("case", "list", "-r", K1.toLowerCase()),
  (res) => okData(res) && res.out.data.cases.some((item) => item.id === created?.id),
);
check(
  "case list --refs (no match)",
  run("case", "list", "-r", missing),
  (res) => okData(res) && res.out.data.cases.length === 0,
);
const runData = check("run create", run("run", "create", "-N", `Regression ${tag}`, "-C", caseRef), okData);
const runRef = `R${runData?.id}`;
check("run view", run("run", "view", runRef), (res) => okData(res) && res.out.data.counts.Untested === 1);
const tests = check(
  "test list",
  run("test", "list", runRef),
  (res) => okData(res) && res.out.data.tests.length === 1,
);
const testRef = `T${tests?.tests[0]?.id}`;
check(
  "result add (test)",
  run("result", "add", testRef, "-s", "failed", "-m", "regression", "-d", K2, "-e", "5s"),
  okData,
);
const importFile = join(mkdtempSync(join(tmpdir(), "testrail-regression-")), "results.json");
writeFileSync(importFile, JSON.stringify([{ case: caseRef, status: "blocked", comment: "import" }]));
check(
  "result import",
  run("result", "import", runRef, "-f", importFile),
  (res) => okData(res) && res.out.data.added.length === 1,
);
check("result add (run+case)", run("result", "add", "-R", runRef, "-C", caseRef, "-s", "retest"), okData);
check(
  "test view",
  run("test", "view", testRef, "-n", "2"),
  (res) => okData(res) && res.out.data.status === "Retest" && res.out.data.results.shown.length === 2,
);
check(
  "test list --status",
  run("test", "list", runRef, "-s", "retest"),
  (res) => okData(res) && res.out.data.tests.length === 1,
);
check(
  "run list",
  run("run", "list"),
  (res) => okData(res) && res.out.data.runs.some((item) => item.id === runData?.id),
);
check(
  "run list -D (closed runs)",
  run("run", "list", "-D", "-n", "5"),
  (res) => okData(res) && res.out.data.runs.every((item) => item.completed),
);
check(
  "project list",
  run("project", "list"),
  (res) => okData(res) && res.out.data.projects.some((item) => item.current),
);
const keysAre = (keys) => (res) => okData(res) && res.out.data.keys.join() === keys;
check("link add case", run("link", "add", caseRef, K2, K1.toLowerCase()), keysAre(`${K1},${K2}`));
check("link add missing ticket", run("link", "add", caseRef, missing), errCode("JIRA_TICKET_NOT_FOUND", 2));
check("link add -N skips the check", run("link", "add", runRef, missing, "-N"), keysAre(missing));
check("link remove case", run("link", "remove", caseRef, K1), keysAre(K2));
check("link remove run", run("link", "remove", runRef, missing), keysAre(""));
check("link add run", run("link", "add", runRef, K1), keysAre(K1));
check(
  "link add test",
  run("link", "add", testRef, K1),
  (res) => okData(res) && res.out.data.keys.includes(K1),
);
check("link list test", run("link", "list", testRef), (res) => okData(res) && res.out.data.keys.includes(K1));
check("LINK_NOT_REMOVABLE", run("link", "remove", testRef, K1), errCode("LINK_NOT_REMOVABLE", 2));
const fromJira = check(
  "case create --from-jira",
  run("case", "create", "-s", sectionId, "-J", K2),
  (res) => okData(res) && res.out.data.title === story && res.out.data.jira.key === K2,
);
const jiraCaseRef = `C${fromJira?.id}`;
const jiraRun = check(
  "run create --from-jira (linked cases)",
  run("run", "create", "-J", K2),
  (res) => okData(res) && res.out.data.name === `${K2}: ${story}` && res.out.data.counts.Untested === 2,
);
const jiraRunRef = `R${jiraRun?.id}`;
check(
  "link list <jira key>",
  run("link", "list", K2.toLowerCase()),
  (res) =>
    okData(res) &&
    res.out.data.target === K2 &&
    [created?.id, fromJira?.id].every((id) => res.out.data.cases.some((item) => item.id === id)) &&
    res.out.data.runs.some((item) => item.id === jiraRun?.id),
);
check("link list <bad key>", run("link", "list", "KAN-0"), errCode("USAGE", 2));
check("NO_LINKED_CASES", run("run", "create", "-J", K1), errCode("NO_LINKED_CASES", 2));
check(
  "JIRA_TICKET_NOT_FOUND",
  run("case", "create", "-s", sectionId, "-J", missing),
  errCode("JIRA_TICKET_NOT_FOUND", 2),
);
const before = tagged();
const bug = check(
  "result add --create-bug (Bug, or Task when the project has no Bug type)",
  run("result", "add", "-R", jiraRunRef, "-C", jiraCaseRef, "-s", "failed", "-m", "regression", "-B"),
  (res) => okData(res) && res.out.data.defects.includes(res.out.data.bug.key),
)?.bug?.key;
if (bug) tickets.push(bug);
check(
  "the bug is in Jira",
  { code: 0, out: jira("ticket", "view", bug ?? missing, "--comments", "0") },
  (res) =>
    okData(res) &&
    ["Bug", "Task"].includes(res.out.data.type) &&
    res.out.data.summary.includes(tag) &&
    JSON.stringify(res.out.data.description).includes("regression"),
);
check(
  "--create-bug, case not in run: no bug",
  run("result", "add", "-R", runRef, "-C", jiraCaseRef, "-s", "failed", "-B"),
  (res) => errCode("CASE_NOT_IN_RUN", 1)(res) && tagged() === before + 1,
);
const jiraTest = run("test", "list", jiraRunRef).out?.data?.tests?.[0]?.id;
check("close the from-jira run", run("run", "close", jiraRunRef, "-y"), okData);
check(
  "--create-bug, closed run: no bug",
  run("result", "add", `T${jiraTest}`, "-s", "failed", "-B"),
  (res) => errCode("RUN_CLOSED", 2)(res) && tagged() === before + 1,
);
check("delete the from-jira case", run("case", "delete", jiraCaseRef, "-y"), okData);
check("USAGE on bad id", run("case", "view", "X1"), errCode("USAGE", 2));
check("CASE_NOT_FOUND", run("case", "view", "C999999999"), errCode("CASE_NOT_FOUND", 1));
check("UNKNOWN_STATUS", run("test", "list", runRef, "-s", "nope"), errCode("UNKNOWN_STATUS", 2));
check("CONFIRM_REQUIRED on close", run("run", "close", runRef), errCode("CONFIRM_REQUIRED", 2));
// Runs are never deleted here: they stay in TestRail as evidence.
check("CONFIRM_REQUIRED on run delete", run("run", "delete", runRef), errCode("CONFIRM_REQUIRED", 2));
check(
  "run close",
  run("run", "close", runRef, "-y"),
  (res) => okData(res) && res.out.data.completed === true,
);
check(
  "case delete",
  run("case", "delete", caseRef, "-y"),
  (res) => okData(res) && res.out.data.deleted === true,
);
check("case gone", run("case", "view", caseRef), errCode("CASE_NOT_FOUND", 1));

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
console.log(`left behind: closed runs ${runRef}, ${jiraRunRef} (kept in TestRail as evidence)`);
process.exit(failures === 0 ? 0 : 1);
