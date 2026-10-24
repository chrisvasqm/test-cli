import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { stdin } from "node:process";
import { CliError, InputError } from "./errors.js";
import { info } from "./output.js";
import { ask, closePrompts } from "./prompt.js";

/** jira-cli errors that `jira setup` fixes. */
const NEEDS_SETUP = new Set(["CONFIG_MISSING", "CONFIG_INVALID", "AUTH_FAILED"]);

/** One jira-cli run; it has its own 30s HTTP timeout and retries. */
const TIMEOUT_MS = 60_000;

interface JiraReply {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

/** The fields of `jira ticket view` this CLI uses. */
export interface JiraTicket {
  key: string;
  url: string;
  type: string;
  summary: string;
  description: string | null;
}

/** `jira ticket create`'s data. */
export interface JiraCreated {
  key: string;
  url: string;
}

/**
 * Check that each key is a Jira ticket by running `jira --json ticket view` (jira-cli, its own
 * config). Without jira-cli on PATH the check is skipped with a note: it is a typo guard, not a
 * requirement. When jira-cli is not set up, a terminal user is offered `jira setup` and the check
 * runs again.
 */
export async function checkJiraKeys(keys: readonly string[], setupOffered = false): Promise<boolean> {
  const replies = await Promise.all(keys.map(async (key) => [key, await runJira(viewArgs(key))] as const));
  if (replies.some(([, reply]) => reply === undefined)) {
    info("jira-cli is not installed, so the Jira keys were not checked.");
    return false;
  }
  const missing = replies
    .filter(([, reply]) => reply?.error?.code === "TICKET_NOT_FOUND")
    .map(([key]) => key);
  if (missing.length > 0) throw ticketNotFound(missing);
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

/** A Jira ticket through jira-cli, which must be installed. */
export function jiraTicket(key: string): Promise<JiraTicket> {
  return callJira<JiraTicket>(viewArgs(key), key);
}

/**
 * A new Bug in jira-cli's configured project. The description goes through stdin, not the command
 * line. Not retried: a timeout may still have created the ticket.
 */
export function createJiraBug(summary: string, description: string): Promise<JiraCreated> {
  const args = [
    "--json",
    "ticket",
    "create",
    "--type",
    "Bug",
    "--summary",
    summary,
    "--description-file",
    "-",
  ];
  return callJira<JiraCreated>(args, undefined, description).catch((err: unknown) => {
    // No JSON answer (timeout, crash): the ticket may exist, so a blind retry could file two.
    if (err instanceof CliError && err.code === "JIRA_ERROR" && isNoAnswer(err.details)) {
      throw new CliError(
        "JIRA_ERROR",
        `${err.message} The bug may have been created; check Jira before retrying.`,
        err.details,
      );
    }
    throw err;
  });
}

const isNoAnswer = (details: unknown): boolean =>
  typeof details === "object" && details !== null && "code" in details && details.code === "INVALID_RESPONSE";

const viewArgs = (key: string): string[] => ["--json", "ticket", "view", key, "--comments", "0"];

function ticketNotFound(keys: string[]): CliError {
  return new InputError(
    "JIRA_TICKET_NOT_FOUND",
    `Jira has no ticket ${keys.join(", ")}, or you cannot see it.`,
    keys,
  );
}

/** jira-cli's data, offering `jira setup` once when it is not set up. `key` names a looked-up ticket. */
async function callJira<T>(args: string[], key?: string, input?: string, setupOffered = false): Promise<T> {
  const reply = await runJira(args, input);
  if (reply === undefined) {
    throw new CliError(
      "JIRA_CLI_MISSING",
      "This needs jira-cli (`jira`) on PATH: https://github.com/chrisvasqm/jira-cli",
    );
  }
  if (reply.ok) return reply.data as T;
  const error = reply.error;
  if (key !== undefined && error?.code === "TICKET_NOT_FOUND") throw ticketNotFound([key]);
  if (!setupOffered && NEEDS_SETUP.has(error?.code ?? "") && (await offerSetup(error?.message))) {
    return callJira<T>(args, key, input, true);
  }
  throw new CliError("JIRA_ERROR", `jira-cli: ${error?.message ?? "no answer"}`, error);
}

/**
 * In a terminal, asks to run `jira setup` and runs it. Agents and scripts (no terminal) get the
 * error instead: setup asks for secrets, which only the user should type.
 */
async function offerSetup(reason: string | undefined): Promise<boolean> {
  const command = jiraCommand();
  if (!stdin.isTTY || !command) return false;
  info(`jira-cli is not set up here: ${reason ?? "it refused the request"}`);
  const answer = await ask("Run `jira setup` now, then try again? (y/n)", "y");
  if (!/^y(es)?$/i.test(answer)) return false;
  // Hand the terminal to jira-cli; its output goes to stderr so stdout stays this CLI's result.
  closePrompts();
  const code = await new Promise<number | null>((resolve) => {
    const child = spawn(command.file, [...command.prefix, "setup"], {
      stdio: ["inherit", process.stderr, "inherit"],
    });
    child.on("error", () => resolve(null));
    child.on("close", resolve);
  });
  if (code !== 0) info("jira setup did not finish.");
  return code === 0;
}

/** The parsed `--json` line, or undefined when jira-cli is not installed. */
function runJira(args: string[], input?: string): Promise<JiraReply | undefined> {
  const command = jiraCommand();
  if (!command) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const child = spawn(command.file, [...command.prefix, ...args], {
      stdio: ["pipe", "pipe", "ignore"],
      timeout: TIMEOUT_MS,
      windowsHide: true,
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.on("error", (err: NodeJS.ErrnoException) =>
      resolve(err.code === "ENOENT" ? undefined : parseReply("")),
    );
    child.on("close", () => resolve(parseReply(stdout)));
    // jira-cli may exit before reading stdin; that EPIPE is not an error here.
    child.stdin.on("error", () => undefined);
    child.stdin.end(input ?? "");
  });
}

/**
 * How to start jira-cli without a shell. On Windows npm installs a `jira.cmd` shim, which Node can
 * only run through cmd.exe, where ticket text could act as commands; so the shim's script runs
 * with node instead.
 */
function jiraCommand(): { file: string; prefix: string[] } | undefined {
  if (process.platform !== "win32") return { file: "jira", prefix: [] };
  for (const dir of (process.env["PATH"] ?? "").split(delimiter)) {
    const shim = join(dir, "jira.cmd");
    if (!dir || !existsSync(shim)) continue;
    const script = /"%~?dp0%?\\([^"]+\.[cm]?js)"/i.exec(readFileSync(shim, "utf8"))?.[1];
    const path = script ? join(dirname(shim), script) : undefined;
    if (path && existsSync(path)) return { file: process.execPath, prefix: [path] };
  }
  return undefined;
}

function parseReply(stdout: string): JiraReply {
  try {
    const reply = JSON.parse(stdout.trim().split("\n").at(-1) ?? "") as JiraReply;
    if (typeof reply.ok === "boolean") return reply;
  } catch {
    // Not jira-cli's JSON line; reported below.
  }
  return {
    ok: false,
    error: { code: "INVALID_RESPONSE", message: "jira-cli did not print a JSON result." },
  };
}
