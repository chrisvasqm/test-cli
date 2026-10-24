#!/usr/bin/env node
// Live regression run against the configured TestRail project: creates its own case and run,
// exercises every command on them, then deletes the case and closes the run.
// Needs a config (testrail setup) pointing at a throwaway project. usage: pnpm regression
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cli = new URL("../dist/index.js", import.meta.url).pathname;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
let failures = 0;

/** Runs `testrail --json …`; returns { code, out } where out is the parsed JSON line. */
function run(...args) {
  try {
    const stdout = execFileSync("node", [cli, "--json", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out: JSON.parse(stdout) };
  } catch (err) {
    return { code: err.status, out: JSON.parse(err.stdout || "{}") };
  }
}

function check(name, result, expect) {
  const ok = expect(result);
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `  ${JSON.stringify(result.out)}`}`);
  return result.out.data;
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
    "--section",
    sectionId,
    "--title",
    `Regression ${stamp}`,
    "--priority",
    "high",
    "--refs",
    "REG-1",
    "--step",
    "Do a::See b",
    "--step",
    "Do c::See d",
  ),
  okData,
);
const caseRef = `C${created?.id}`;
check("case view", run("case", "view", caseRef), (res) => okData(res) && res.out.data.stepList.length === 2);
check("case edit", run("case", "edit", caseRef, "--priority", "low", "--estimate", "2m"), okData);
check(
  "case list",
  run("case", "list", "--section", sectionId, "--limit", "250"),
  (res) =>
    okData(res) && res.out.data.cases.some((item) => item.id === created?.id && item.priority === "Low"),
);
const runData = check(
  "run create",
  run("run", "create", "--name", `Regression ${stamp}`, "--cases", caseRef),
  okData,
);
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
  run(
    "result",
    "add",
    testRef,
    "--status",
    "failed",
    "--comment",
    "regression",
    "--defects",
    "REG-2",
    "--elapsed",
    "5s",
  ),
  okData,
);
const importFile = join(mkdtempSync(join(tmpdir(), "testrail-regression-")), "results.json");
writeFileSync(importFile, JSON.stringify([{ case: caseRef, status: "blocked", comment: "import" }]));
check(
  "result import",
  run("result", "import", runRef, "--file", importFile),
  (res) => okData(res) && res.out.data.added.length === 1,
);
check(
  "result add (run+case)",
  run("result", "add", "--run", runRef, "--case", caseRef, "--status", "retest"),
  okData,
);
check(
  "test view",
  run("test", "view", testRef, "--results", "2"),
  (res) => okData(res) && res.out.data.status === "Retest" && res.out.data.results.shown.length === 2,
);
check(
  "test list --status",
  run("test", "list", runRef, "--status", "retest"),
  (res) => okData(res) && res.out.data.tests.length === 1,
);
check(
  "run list",
  run("run", "list"),
  (res) => okData(res) && res.out.data.runs.some((item) => item.id === runData?.id),
);
check(
  "project list",
  run("project", "list"),
  (res) => okData(res) && res.out.data.projects.some((item) => item.current),
);
check("USAGE on bad id", run("case", "view", "X1"), errCode("USAGE", 2));
check("CASE_NOT_FOUND", run("case", "view", "C999999999"), errCode("CASE_NOT_FOUND", 1));
check("UNKNOWN_STATUS", run("test", "list", runRef, "--status", "nope"), errCode("UNKNOWN_STATUS", 2));
check("CONFIRM_REQUIRED on close", run("run", "close", runRef), errCode("CONFIRM_REQUIRED", 2));
check(
  "run close",
  run("run", "close", runRef, "--yes"),
  (res) => okData(res) && res.out.data.completed === true,
);
check(
  "case delete",
  run("case", "delete", caseRef, "--yes"),
  (res) => okData(res) && res.out.data.deleted === true,
);
check("case gone", run("case", "view", caseRef), errCode("CASE_NOT_FOUND", 1));

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
console.log(`left behind: closed run ${runRef} (TestRail keeps closed runs; the CLI has no run delete)`);
process.exit(failures === 0 ? 0 : 1);
