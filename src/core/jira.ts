import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { stdin } from "node:process";
import { z } from "zod";
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

/** At most this many jira-cli processes run at once (each makes its own Jira request). */
const MAX_PARALLEL = 4;

/** The fields of `jira ticket view` this CLI uses; other fields are dropped. */
const ticketSchema = z.object({ key: z.string().min(1), url: z.string(), summary: z.string().min(1) });
export type JiraTicket = z.infer<typeof ticketSchema>;

/** `jira ticket create`'s data. */
const createdSchema = z.object({ key: z.string().min(1), url: z.string() });
export type JiraCreated = z.infer<typeof createdSchema>;

/**
 * Check that each key is a Jira ticket by running `jira --json ticket view` (jira-cli, its own
 * config). Without jira-cli on PATH the check is skipped with a note: it is a typo guard, not a
 * requirement. When jira-cli is not set up, a terminal user is offered `jira setup` and the check
 * runs again.
 */
export async function checkJiraKeys(keys: readonly string[], setupOffered = false): Promise<boolean> {
  const replies = await viewAll(keys);
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

/** `jira ticket view` for each key, MAX_PARALLEL at a time; undefined replies mean no jira-cli. */
async function viewAll(keys: readonly string[]): Promise<(readonly [string, JiraReply | undefined])[]> {
  const replies: (readonly [string, JiraReply | undefined])[] = [];
  for (let start = 0; start < keys.length; start += MAX_PARALLEL) {
    const batch = keys.slice(start, start + MAX_PARALLEL);
    replies.push(
      ...(await Promise.all(batch.map(async (key) => [key, await runJira(viewArgs(key))] as const))),
    );
  }
  return replies;
}

/** The status field of `jira ticket view`. jira-cli has no status category, only the name. */
const statusSchema = z.object({ status: z.string().min(1) });

/**
 * Each key's Jira status name, or null when Jira has no such ticket (or the user cannot see it).
 * Any other jira-cli failure fails the lookup as a whole; a terminal user is offered `jira setup`
 * once, and the lookup runs again.
 */
export async function jiraStatuses(
  keys: readonly string[],
  setupOffered = false,
): Promise<Map<string, string | null>> {
  const replies = await viewAll(keys);
  if (replies.some(([, reply]) => reply === undefined)) throw cliMissing();
  const statuses = new Map<string, string | null>();
  for (const [key, reply] of replies) {
    if (reply?.error?.code === "TICKET_NOT_FOUND") {
      statuses.set(key, null);
      continue;
    }
    const parsed = statusSchema.safeParse(reply?.data);
    if (reply?.ok === true && parsed.success) {
      statuses.set(key, parsed.data.status);
      continue;
    }
    const error = reply?.ok === true ? { code: "INVALID_RESPONSE", message: "no status" } : reply?.error;
    if (!setupOffered && NEEDS_SETUP.has(error?.code ?? "") && (await offerSetup(error?.message))) {
      return jiraStatuses(keys, true);
    }
    throw new CliError(
      "JIRA_ERROR",
      `jira-cli could not read ${key}: ${error?.message ?? "no answer"}`,
      error,
    );
  }
  return statuses;
}

const cliMissing = (): CliError =>
  new CliError(
    "JIRA_CLI_MISSING",
    "This needs jira-cli (`jira`) on PATH: https://github.com/chrisvasqm/jira-cli",
  );

/** A Jira ticket through jira-cli, which must be installed. */
export function jiraTicket(key: string): Promise<JiraTicket> {
  return callJira(viewArgs(key), ticketSchema, key);
}

/**
 * A new Bug in jira-cli's configured project, or a Task when the project has no Bug type. Bug is
 * tried first every time, so adding the type to the project switches back without a change here.
 * The description goes through stdin, not the command line. Not retried on a timeout: it may still
 * have created the ticket. A rejected issue type (400) created nothing, so the Task retry is safe.
 */
export async function createJiraBug(summary: string, description: string): Promise<JiraCreated> {
  try {
    return await createJiraTicket("Bug", summary, description);
  } catch (err) {
    if (!(err instanceof CliError && isBadIssueType(err.details))) throw err;
    info("The Jira project has no Bug issue type, so the bug is filed as a Task.");
    return createJiraTicket("Task", summary, description);
  }
}

function createJiraTicket(type: string, summary: string, description: string): Promise<JiraCreated> {
  const args = [
    "--json",
    "ticket",
    "create",
    "--type",
    type,
    "--summary",
    summary,
    "--description-file",
    "-",
  ];
  return callJira(args, createdSchema, undefined, description).catch((err: unknown) => {
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

/** jira-cli's error for Jira's 400 `{ errors: { issuetype } }`: the project has no such type. */
const isBadIssueType = (details: unknown): boolean =>
  z.object({ details: z.object({ errors: z.object({ issuetype: z.string() }) }) }).safeParse(details).success;

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
async function callJira<T>(
  args: string[],
  schema: z.ZodType<T>,
  key?: string,
  input?: string,
  setupOffered = false,
): Promise<T> {
  const reply = await runJira(args, input);
  if (reply === undefined) throw cliMissing();
  if (reply.ok) {
    const parsed = schema.safeParse(reply.data);
    if (parsed.success) return parsed.data;
    throw new CliError("JIRA_ERROR", "jira-cli answered in an unexpected shape; update jira-cli.", {
      code: "INVALID_RESPONSE",
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    });
  }
  const error = reply.error;
  if (key !== undefined && error?.code === "TICKET_NOT_FOUND") throw ticketNotFound([key]);
  if (!setupOffered && NEEDS_SETUP.has(error?.code ?? "") && (await offerSetup(error?.message))) {
    return callJira(args, schema, key, input, true);
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
 * How to start jira-cli without a shell, found once per process. On Windows npm installs a
 * `jira.cmd` shim, which Node can only run through cmd.exe, where ticket text could act as
 * commands; so the shim's script runs with node instead. Only when no such shim exists is a
 * `jira.exe` (e.g. a Volta shim) used: another tool named jira (the Go jira-cli) ships as one too.
 */
let found: { file: string; prefix: string[] } | undefined | null = null;

function jiraCommand(): { file: string; prefix: string[] } | undefined {
  if (process.platform !== "win32") return { file: "jira", prefix: [] };
  if (found !== null) return found;
  const dirs = (process.env["PATH"] ?? "").split(delimiter).filter(Boolean);
  found = dirs.map(shimScript).find(Boolean) ?? exeIn(dirs);
  return found;
}

function shimScript(dir: string): { file: string; prefix: string[] } | undefined {
  const shim = join(dir, "jira.cmd");
  if (!existsSync(shim)) return undefined;
  const script = /"%~?dp0%?\\([^"]+\.[cm]?js)"/i.exec(readFileSync(shim, "utf8"))?.[1];
  const path = script ? join(dirname(shim), script) : undefined;
  return path && existsSync(path) ? { file: process.execPath, prefix: [path] } : undefined;
}

function exeIn(dirs: string[]): { file: string; prefix: string[] } | undefined {
  const exe = dirs.map((dir) => join(dir, "jira.exe")).find((path) => existsSync(path));
  return exe ? { file: exe, prefix: [] } : undefined;
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
