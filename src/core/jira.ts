import { execFile, spawn } from "node:child_process";
import { stdin } from "node:process";
import { CliError, InputError } from "./errors.js";
import { info } from "./output.js";
import { ask, closePrompts } from "./prompt.js";

/** jira-cli errors that `jira setup` fixes. */
const NEEDS_SETUP = new Set(["CONFIG_MISSING", "CONFIG_INVALID", "AUTH_FAILED"]);

/** One Jira lookup; jira-cli has its own 30s HTTP timeout and retries. */
const TIMEOUT_MS = 60_000;

interface JiraReply {
  ok: boolean;
  error?: { code: string; message: string };
}

/**
 * Check that each key is a Jira ticket by running `jira --json ticket view` (jira-cli, its own
 * config). Without jira-cli on PATH the check is skipped with a note: it is a typo guard, not a
 * requirement. When jira-cli is not set up, a terminal user is offered `jira setup` and the check
 * runs again. Keys are already validated as ABC-123, so the Windows shell sees no metacharacters.
 */
export async function checkJiraKeys(keys: readonly string[], setupOffered = false): Promise<boolean> {
  const replies = await Promise.all(keys.map(async (key) => [key, await viewTicket(key)] as const));
  if (replies.some(([, reply]) => reply === undefined)) {
    info("jira-cli is not installed, so the Jira keys were not checked.");
    return false;
  }
  const missing = replies
    .filter(([, reply]) => reply?.error?.code === "TICKET_NOT_FOUND")
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new InputError(
      "JIRA_TICKET_NOT_FOUND",
      `Jira has no ticket ${missing.join(", ")}, or you cannot see it.`,
      missing,
    );
  }
  const failed = replies.find(([, reply]) => reply?.ok !== true);
  if (failed) {
    const error = failed[1]?.error;
    if (!setupOffered && NEEDS_SETUP.has(error?.code ?? "") && (await offerSetup(error?.message))) {
      return checkJiraKeys(keys, true);
    }
    throw new CliError(
      "JIRA_CHECK_FAILED",
      `jira-cli could not check ${failed[0]}: ${error?.message ?? "no answer"} Fix jira-cli, or pass --no-check.`,
      error,
    );
  }
  return true;
}

/**
 * In a terminal, asks to run `jira setup` and runs it. Agents and scripts (no terminal) get
 * JIRA_CHECK_FAILED instead: setup asks for secrets, which only the user should type.
 */
async function offerSetup(reason: string | undefined): Promise<boolean> {
  if (!stdin.isTTY) return false;
  info(`jira-cli is not set up here: ${reason ?? "it refused the check"}`);
  const answer = await ask("Run `jira setup` now, then check again? (y/n)", "y");
  if (!/^y(es)?$/i.test(answer)) return false;
  // Hand the terminal to jira-cli; its output goes to stderr so stdout stays this CLI's result.
  closePrompts();
  const code = await new Promise<number | null>((resolve) => {
    const child = spawn("jira", ["setup"], {
      stdio: ["inherit", process.stderr, "inherit"],
      shell: process.platform === "win32",
    });
    child.on("error", () => resolve(null));
    child.on("close", resolve);
  });
  if (code !== 0) info("jira setup did not finish.");
  return code === 0;
}

/** The parsed `--json` line, or undefined when the jira binary is missing. */
function viewTicket(key: string): Promise<JiraReply | undefined> {
  return new Promise((resolve) => {
    execFile(
      "jira",
      ["--json", "ticket", "view", key, "--comments", "0"],
      { timeout: TIMEOUT_MS, shell: process.platform === "win32", windowsHide: true },
      (err, stdout, stderr) => {
        // Through cmd.exe a missing binary is exit 1 with "is not recognized", not ENOENT.
        const missing = err?.code === "ENOENT" || (stdout.trim() === "" && /not recognized/i.test(stderr));
        if (missing) return resolve(undefined);
        resolve(parseReply(stdout));
      },
    );
  });
}

function parseReply(stdout: string): JiraReply {
  try {
    const reply = JSON.parse(stdout.trim().split("\n").at(-1) ?? "") as JiraReply;
    if (typeof reply.ok === "boolean") return reply;
  } catch {
    // Not jira-cli's JSON line; reported below.
  }
  return { ok: false, error: { code: "INVALID_RESPONSE", message: "jira-cli did not print a JSON result." } };
}
