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
/** Every ticket this run made, in order; deleted on exit. */
const tickets = [];

/** Runs `jira --json …`; returns the parsed JSON line. */
function jira(...args) {
  try {
    return parseLine(
      execFileSync("jira", ["--json", ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
      }),
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

/** The key Jira gives the next ticket after `key`: it must not exist while no ticket was filed. */
const nextKey = (key) => key.replace(/\d+$/, (num) => String(Number(num) + 1));
const noTicket = (key) => jira("ticket", "view", key, "--comments", "0").error?.code === "TICKET_NOT_FOUND";

process.on("exit", () => {
  // Newest first, so a subtask goes before its parent.
  const left = tickets.toReversed().filter((key) => jira("ticket", "delete", key, "--yes").ok !== true);
  console.log(`deleted Jira tickets: ${tickets.filter((key) => !left.includes(key)).join(", ") || "none"}`);
  if (left.length > 0) {
    console.log(`FAIL could not delete Jira tickets: ${left.join(", ")}`);
    process.exitCode = 1;
  }
});
// Ctrl+C or a kill still runs the exit handler, so no ticket is left behind.
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

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
    "-sc",
    sectionId,
    "-t",
    `Regression ${tag}`,
    "-p",
    "high",
    "-r",
    K1,
    "-sa",
    "Do a::See b",
    "-sa",
    "Do c::See d",
  ),
  okData,
);
const caseRef = `C${created?.id}`;
check("case view", run("case", "view", caseRef), (res) => okData(res) && res.out.data.stepList.length === 2);
check(
  "case edit",
  run("case", "edit", caseRef, "-p", "low", "-es", "2m", "-ty", "Functional", "-pc", "Logged out"),
  okData,
);
check(
  "case list",
  run("case", "list", "-sc", sectionId, "-n", "250"),
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
const runData = check("run create", run("run", "create", "-na", `Regression ${tag}`, "-ca", caseRef), okData);
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
  run("result", "add", testRef, "-s", "failed", "-m", "regression", "-df", K2, "-e", "5s"),
  okData,
);
const importFile = join(mkdtempSync(join(tmpdir(), "testrail-regression-")), "results.json");
writeFileSync(importFile, JSON.stringify([{ case: caseRef, status: "blocked", comment: "import" }]));
check(
  "result import",
  run("result", "import", runRef, "-f", importFile),
  (res) => okData(res) && res.out.data.added.length === 1,
);
check("result add (run+case)", run("result", "add", "-ru", runRef, "-ca", caseRef, "-s", "retest"), okData);
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
  "run list -cp (closed runs)",
  run("run", "list", "-cp", "-n", "5"),
  (res) => okData(res) && res.out.data.runs.every((item) => item.completed),
);
check(
  "project list",
  run("project", "list"),
  (res) => okData(res) && res.out.data.projects.some((item) => item.current),
);
check(
  "project view",
  run("project", "view"),
  (res) =>
    okData(res) &&
    res.out.data.project.current &&
    res.out.data.runs.some((item) => item.id === runData?.id && item.total === 1) &&
    res.out.data.totals.total >= 1,
);
check(
  "project view -n 1",
  run("project", "view", "-n", "1"),
  (res) =>
    okData(res) &&
    res.out.data.runs.length <= 1 &&
    res.out.data.plans.length <= 1 &&
    res.out.data.milestones.filter((item) => item.parentId === null).length <= 1,
);
check("PROJECT_NOT_FOUND", run("project", "view", "P999999999"), errCode("PROJECT_NOT_FOUND", 1));
const keysAre = (keys) => (res) => okData(res) && res.out.data.keys.join() === keys;
check("link add case", run("link", "add", caseRef, K2, K1.toLowerCase()), keysAre(`${K1},${K2}`));
check("link add missing ticket", run("link", "add", caseRef, missing), errCode("JIRA_TICKET_NOT_FOUND", 2));
check("link add -nc skips the check", run("link", "add", runRef, missing, "-nc"), keysAre(missing));
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
  run("case", "create", "-sc", sectionId, "-fj", K2),
  (res) => okData(res) && res.out.data.title === story && res.out.data.jira.key === K2,
);
const jiraCaseRef = `C${fromJira?.id}`;
const jiraRun = check(
  "run create --from-jira (linked cases)",
  run("run", "create", "-fj", K2),
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
check("NO_LINKED_CASES", run("run", "create", "-fj", K1), errCode("NO_LINKED_CASES", 2));
// An epic's children: a subtask of K2, linked to the from-jira case.
const child = jira(
  "ticket",
  "create",
  "--type",
  "Subtask",
  "--parent",
  K2,
  "--summary",
  `Regression ${tag} child (delete me)`,
  "--description",
  "Created by testrail-cli regression",
).data?.key;
if (child) tickets.push(child);
check("link add <child>", run("link", "add", jiraCaseRef, child ?? missing), okData);
const epicRun = check(
  "run create --from-epic",
  run("run", "create", "-ep", K2),
  (res) => okData(res) && res.out.data.tickets.from === "epic" && res.out.data.tickets.linked.includes(child),
)?.id;
if (epicRun) check("delete the from-epic run", run("run", "delete", `R${epicRun}`, "-y"), okData);
check(
  "coverage --epic",
  run("coverage", "-ep", K2, "-rn", "5"),
  (res) =>
    okData(res) &&
    res.out.data.summary.covered === 1 &&
    res.out.data.tickets[0]?.cases.some((item) => `C${item.id}` === jiraCaseRef),
);
check(
  "coverage --jql (uncovered)",
  run("coverage", "-ql", `key = ${K1}`, "-rn", "1"),
  (res) => okData(res) && res.out.data.summary.uncovered === 1 && res.out.data.tickets[0]?.cases.length === 0,
);
check("coverage -w -ep", run("coverage", "-w", "active", "-ep", K2), errCode("USAGE", 2));
// Later checks (run sync) expect only K2 in the case's refs.
check("link remove <child>", run("link", "remove", jiraCaseRef, child ?? missing), okData);
check("run create -ep (no children)", run("run", "create", "-ep", K1), errCode("NO_LINKED_CASES", 2));
check("run create -w -fj", run("run", "create", "-w", "active", "-fj", K1), errCode("USAGE", 2));
check("SPRINT_NOT_FOUND", run("run", "create", "-w", `No sprint ${tag}`), errCode("SPRINT_NOT_FOUND", 2));
check(
  "JIRA_TICKET_NOT_FOUND",
  run("case", "create", "-sc", sectionId, "-fj", missing),
  errCode("JIRA_TICKET_NOT_FOUND", 2),
);
const bug = check(
  "result add --create-bug (Bug, or Task when the project has no Bug type)",
  run("result", "add", "-ru", jiraRunRef, "-ca", jiraCaseRef, "-s", "failed", "-m", "regression", "-cb"),
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
  run("result", "add", "-ru", runRef, "-ca", jiraCaseRef, "-s", "failed", "-cb"),
  (res) => errCode("CASE_NOT_IN_RUN", 1)(res) && noTicket(nextKey(bug ?? missing)),
);
check("run sync without --yes", run("run", "sync", jiraRunRef), errCode("CONFIRM_REQUIRED", 2));
check(
  "run sync (comments; a failed test keeps the run's ticket in place)",
  run("run", "sync", jiraRunRef, "-y", "-mv", "Done"),
  (res) => {
    const linked = res.out.data.tickets.find((item) => item.key === K2);
    return (
      okData(res) &&
      linked.scope === "cases" &&
      linked.commented &&
      linked.moved === null &&
      linked.tests.notPassed.length > 0 &&
      res.out.data.tickets.every((item) => item.error === null)
    );
  },
);
const jiraTest = run("test", "list", jiraRunRef).out?.data?.tests?.[0]?.id;
check("close the from-jira run", run("run", "close", jiraRunRef, "-y"), okData);
check(
  "--create-bug, closed run: no bug",
  run("result", "add", `T${jiraTest}`, "-s", "failed", "-cb"),
  (res) => errCode("RUN_CLOSED", 2)(res) && noTicket(nextKey(bug ?? missing)),
);
check("delete the from-jira case", run("case", "delete", jiraCaseRef, "-y"), okData);
// Plans, milestones, suites, sections, assignment, attachments, steps, history and filters.
const hasRows = (key, test) => (res) => okData(res) && res.out.data[key].some(test);
check(
  "user list",
  run("user", "list"),
  hasRows("users", (item) => item.me),
);
const suites = check(
  "suite list",
  run("suite", "list"),
  (res) => okData(res) && res.out.data.suites.length > 0,
);
check("suite view", run("suite", "view", `S${suites?.suites[0]?.id}`), okData);
check("configuration list", run("configuration", "list"), okData);
check("report list", run("report", "list"), okData);
const milestone = check(
  "milestone create",
  run("milestone", "create", "-na", `Regression ${tag}`, "-du", "2030-01-31", "-r", K1),
  okData,
);
const msRef = `M${milestone?.id}`;
check(
  "milestone view",
  run("milestone", "view", msRef),
  (res) => okData(res) && res.out.data.id === milestone?.id,
);
check(
  "milestone list",
  run("milestone", "list", "-n", "250"),
  hasRows("milestones", (item) => item.id === milestone?.id),
);
check(
  "milestone edit",
  run("milestone", "edit", msRef, "-na", `Regression ${tag} edited`, "-du", "2030-02-28", "-d", "edited"),
  (res) => okData(res) && res.out.data.name === `Regression ${tag} edited`,
);
check("milestone edit with no field", run("milestone", "edit", msRef), errCode("USAGE", 2));
check(
  "milestone edit -sd -sr",
  run("milestone", "edit", msRef, "-sd", "2030-01-01", "-sr"),
  errCode("USAGE", 2),
);
check(
  "MILESTONE_NOT_FOUND on edit",
  run("milestone", "edit", "M999999", "-na", "x"),
  errCode("MILESTONE_NOT_FOUND", 1),
);
const subMilestone = check(
  "milestone create -sd",
  run("milestone", "create", "-na", `Regression ${tag} child`, "-sd", "2030-01-01"),
  okData,
);
const subRef = `M${subMilestone?.id}`;
check(
  "milestone edit -pa -sr",
  run("milestone", "edit", subRef, "-pa", msRef, "-sr"),
  (res) => okData(res) && res.out.data.parentId === milestone?.id && res.out.data.started === true,
);
check("milestone close", run("milestone", "close", subRef), (res) => okData(res) && res.out.data.completed);
check(
  "milestone reopen",
  run("milestone", "reopen", subRef),
  (res) => okData(res) && res.out.data.completed === false,
);
check(
  "CONFIRM_REQUIRED on milestone delete",
  run("milestone", "delete", subRef),
  errCode("CONFIRM_REQUIRED", 2),
);
check(
  "milestone delete",
  run("milestone", "delete", subRef, "-y"),
  (res) => okData(res) && res.out.data.deleted === true,
);
check("milestone gone", run("milestone", "view", subRef), errCode("MILESTONE_NOT_FOUND", 1));
const section = check(
  "section create",
  run("section", "create", "-na", `Regression ${tag}`, "-pa", sectionId, "-d", "regression"),
  okData,
);
const newSection = String(section?.id);
check("section edit", run("section", "edit", newSection, "-na", `Regression ${tag} edited`), okData);
check("case copy", run("case", "copy", caseRef, "-sc", newSection), okData);
const copies = check(
  "case list (copied case)",
  run("case", "list", "-sc", newSection),
  (res) => okData(res) && res.out.data.cases.length === 1,
);
const copyRef = `C${copies?.cases[0]?.id}`;
check("case move", run("case", "move", copyRef, "-sc", sectionId), okData);
check("case edit (several)", run("case", "edit", caseRef, copyRef, "-p", "medium"), okData);
check("case edit (several) -t", run("case", "edit", caseRef, copyRef, "-t", "x"), errCode("USAGE", 2));
check(
  "case list -q -p",
  run("case", "list", "-q", tag, "-p", "medium"),
  (res) => okData(res) && res.out.data.cases.length >= 2,
);
check("section move", run("section", "move", newSection, "-pa", "top"), okData);
check(
  "CONFIRM_REQUIRED on section delete",
  run("section", "delete", newSection),
  errCode("CONFIRM_REQUIRED", 2),
);
check("section delete", run("section", "delete", newSection, "-y"), okData);
check(
  "run edit",
  run("run", "edit", runRef, "-na", `Regression ${tag} edited`, "-a", "me", "-ml", msRef, "-i", copyRef),
  okData,
);
check(
  "run edit -x",
  run("run", "edit", runRef, "-x", copyRef, "-y"),
  (res) => okData(res) && run("test", "list", runRef).out.data.tests.length === 1,
);
const attachFile = join(mkdtempSync(join(tmpdir(), "testrail-regression-")), "evidence.txt");
writeFileSync(attachFile, `regression ${tag}\n`);
check(
  "result add -a -sl -at",
  run("result", "add", testRef, "-s", "passed", "-a", "me", "-sl", "1:passed,2:failed", "-at", attachFile),
  okData,
);
check(
  "test list -a me",
  run("test", "list", runRef, "-a", "me"),
  (res) => okData(res) && res.out.data.tests.length === 1,
);
check(
  "test todo -s passed",
  run("test", "todo", "-s", "passed"),
  hasRows("tests", (item) => `T${item.id}` === testRef),
);
check(
  "test view (steps)",
  run("test", "view", testRef, "-n", "1"),
  (res) => okData(res) && res.out.data.results.shown[0].steps.length === 2,
);
check(
  "attachment list (test)",
  run("attachment", "list", testRef),
  (res) => okData(res) && res.out.data.attachments.length >= 1,
);
check("attachment add (case)", run("attachment", "add", caseRef, attachFile), okData);
check(
  "attachment list (case)",
  run("attachment", "list", caseRef),
  (res) => okData(res) && res.out.data.attachments.length >= 1,
);
check(
  "case history -ru",
  run("case", "history", caseRef, "-ru", runRef),
  (res) => okData(res) && res.out.data.results.length >= 4,
);
check(
  "case history",
  run("case", "history", caseRef, "-n", "2"),
  (res) => okData(res) && res.out.data.results.length === 2,
);
const rerun = check(
  "run create -ru (rerun)",
  run("run", "create", "-ru", runRef, "-s", "passed"),
  (res) => okData(res) && res.out.data.counts.Untested === 1,
);
const rerunRef = `R${rerun?.id}`;
check(
  "NO_MATCHING_TESTS",
  run("run", "create", "-ru", runRef, "-s", "blocked"),
  errCode("NO_MATCHING_TESTS", 2),
);
const plan = check(
  "plan create",
  run("plan", "create", "-na", `Regression ${tag}`, "-ml", msRef, "-ca", caseRef),
  okData,
);
const planRef = `R${plan?.id}`;
check("plan add-run", run("plan", "add-run", planRef, "-ca", caseRef, "-a", "me"), okData);
check(
  "test todo -ml (plan run)",
  run("test", "todo", "-ml", msRef),
  hasRows("tests", (item) => item.planId === plan?.id && item.status === "Untested"),
);
check("plan view", run("plan", "view", planRef), (res) => okData(res) && res.out.data.entries.length === 2);
check(
  "plan list",
  run("plan", "list"),
  hasRows("plans", (item) => item.id === plan?.id),
);
check("CONFIRM_REQUIRED on plan close", run("plan", "close", planRef), errCode("CONFIRM_REQUIRED", 2));
check("plan close", run("plan", "close", planRef, "-y"), okData);
check("close the rerun", run("run", "close", rerunRef, "-y"), okData);
check("delete the copied case", run("case", "delete", copyRef, "-y"), okData);
check("result add (failed, defect K1)", run("result", "add", testRef, "-s", "failed", "-df", K1), okData);
const k1Status = jira("ticket", "view", K1, "--comments", "0").data?.status ?? "To Do";
const retestIds = (key) => (res) =>
  okData(res) && res.out.data[key].some((row) => `T${row.testId}` === testRef);
check("run retest (bug open: waiting)", run("run", "retest", runRef, "-y"), retestIds("waiting"));
check(
  "CONFIRM_REQUIRED on run retest",
  run("run", "retest", runRef, "-dn", k1Status),
  errCode("CONFIRM_REQUIRED", 2),
);
check(
  "run retest -dn (bug done)",
  run("run", "retest", runRef, "-dn", k1Status, "-y"),
  retestIds("retested"),
);
check(
  "run retest: test is Retest",
  run("test", "view", testRef),
  (res) => okData(res) && res.out.data.status === "Retest",
);
check("RUN_NOT_FOUND on run retest", run("run", "retest", "R999999999", "-y"), errCode("RUN_NOT_FOUND", 1));
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

// Last: the plan and run on it are done with the milestone.
check(
  "milestone close (kept)",
  run("milestone", "close", msRef),
  (res) => okData(res) && res.out.data.completed,
);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
console.log(
  `left behind: closed runs ${runRef}, ${jiraRunRef}, ${rerunRef}, closed plan ${planRef} and closed milestone ${msRef} (kept in TestRail as evidence)`,
);
process.exit(failures === 0 ? 0 : 1);
