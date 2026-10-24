import { createInterface, type Interface } from "node:readline";
import { stdin, stderr } from "node:process";
import { Writable } from "node:stream";
import { CliError } from "./errors.js";
import { stripControls } from "./output.js";

const eof = (): CliError => new CliError("INPUT_EOF", "Input ended before all prompts were answered.");
const interrupted = (): CliError => new CliError("INTERRUPTED", "Cancelled.");

interface Waiter {
  resolve: (line: string) => void;
  reject: (err: Error) => void;
}

let rl: Interface | undefined;
let ended = false;
let muted = false;
const queued: string[] = [];
const waiters: Waiter[] = [];

/** stderr, except that typed characters are hidden while a secret is entered. */
const output = new Writable({
  write(chunk: Buffer | string, _encoding, done) {
    if (!muted) stderr.write(chunk);
    done();
  },
});

/**
 * One shared interface that buffers every line, so piped input is never dropped
 * between questions. Prompts go to stderr; stdout stays machine-readable.
 */
function iface(): Interface {
  if (rl) return rl;
  // historySize 0: the Up arrow must never bring back an API token.
  rl = createInterface({ input: stdin, output, terminal: Boolean(stdin.isTTY), historySize: 0 });
  rl.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(line);
    else queued.push(line);
  });
  rl.on("SIGINT", () => {
    // With no question pending (e.g. during a request), Ctrl+C must still stop the CLI.
    if (waiters.length === 0) {
      closePrompts();
      process.exit(130);
    }
    failAll(interrupted());
  });
  rl.on("close", () => {
    ended = true;
    failAll(eof());
  });
  return rl;
}

function failAll(err: Error): void {
  for (const waiter of waiters.splice(0)) waiter.reject(err);
}

export function closePrompts(): void {
  rl?.removeAllListeners("close");
  rl?.close();
  rl = undefined;
}

function nextLine(): Promise<string> {
  const line = queued.shift();
  if (line !== undefined) return Promise.resolve(line);
  if (ended) return Promise.reject(eof());
  return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
}

export async function ask(question: string, fallback?: string): Promise<string> {
  const io = iface();
  const suffix = fallback ? ` [${fallback}]` : "";
  io.setPrompt(stripControls(`${question}${suffix}: `));
  io.prompt();
  const answer = (await nextLine()).trim();
  return answer || fallback || "";
}

/** Like ask, but nothing typed is shown. */
export async function askSecret(question: string): Promise<string> {
  const io = iface();
  stderr.write(stripControls(`${question}: `));
  muted = true;
  try {
    return (await nextLine()).trim();
  } finally {
    muted = false;
    if (io.terminal) stderr.write("\n");
  }
}
