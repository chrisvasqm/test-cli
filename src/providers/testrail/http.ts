import { setTimeout as sleep } from "node:timers/promises";
import { CliError } from "../../core/errors.js";

/** A TestRail site and the account that signs in to it. */
export interface Credentials {
  baseUrl: string;
  email: string;
  apiKey: string;
}

/** Query values; undefined ones are left out. */
export type Params = Record<string, string | number | boolean | undefined>;

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
/** A request that gets no answer in this time fails (and a GET is retried). */
const REQUEST_TIMEOUT_MS = 30_000;
/** An upload (up to TestRail's 256 MB per file) gets longer than a JSON request. */
const UPLOAD_TIMEOUT_MS = 600_000;
/** Longest Retry-After wait the client honors. TestRail Cloud allows 180-300 requests a minute. */
const MAX_RETRY_AFTER_MS = 60_000;
/** Wait after a 429 that has no Retry-After header. */
const RATE_LIMIT_WAIT_MS = 20_000;
/** Longest raw (non-JSON) error body kept in error details, e.g. a proxy's HTML page. */
const MAX_RAW_DETAIL_CHARS = 500;

interface Reply {
  status: number;
  retryAfter: string | null;
  text: string;
}

/** One TestRail site's networking entry point: auth header, JSON encoding, retries with exponential backoff. */
export class HttpClient {
  private readonly authHeader: string;

  constructor(private readonly creds: Credentials) {
    const raw = `${creds.email}:${creds.apiKey}`;
    this.authHeader = `Basic ${Buffer.from(raw).toString("base64")}`;
  }

  /**
   * `endpoint` is an API v2 method with its path ids, e.g. "get_case/12".
   * GET is retried on transient failures; writes only on 429, which TestRail never applied.
   */
  get<T>(endpoint: string, params?: Params): Promise<T> {
    return this.send<T>("GET", apiPath(endpoint, params));
  }

  /** TestRail writes (add, update, close, delete) are all POST. */
  post<T>(endpoint: string, body: unknown = {}, params?: Params): Promise<T> {
    return this.send<T>("POST", apiPath(endpoint, params), body);
  }

  /** A multipart POST (attachments): the same auth, retry rule and error mapping, with a longer timeout. */
  postForm<T>(endpoint: string, form: FormData): Promise<T> {
    return this.send<T>("POST", apiPath(endpoint), form, UPLOAD_TIMEOUT_MS);
  }

  /** Follows a pagination link from `_links.next`, e.g. "/api/v2/get_cases/1&limit=250&offset=250". */
  getLink<T>(link: string): Promise<T> {
    return this.send<T>("GET", link.startsWith("/") ? link : `/${link}`);
  }

  private async send<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    // Only GETs are safe to repeat after a lost answer; writes are retried only on 429, which TestRail never applied.
    const idempotent = method === "GET";
    // TestRail routes through index.php's query string, so filters follow with "&", not "?".
    const url = `${this.creds.baseUrl}/index.php?${path}`;
    // TestRail needs the JSON content type on every request, GET included. A form gets fetch's own
    // multipart type, which carries the boundary; a file-backed form can be sent again on a 429.
    const form = body instanceof FormData;
    const headers: Record<string, string> = { Authorization: this.authHeader, Accept: "application/json" };
    if (!form) headers["Content-Type"] = "application/json";
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = form ? body : JSON.stringify(body);

    for (let attempt = 0; ; attempt++) {
      const more = attempt < MAX_RETRIES;
      const reply = await this.attempt(url, init, idempotent, more, timeoutMs);
      if (reply === undefined) {
        await sleep(this.backoff(attempt));
        continue;
      }
      const retryable = reply.status === 429 || (idempotent && RETRYABLE_STATUS.has(reply.status));
      if (more && retryable) {
        await sleep(this.backoff(attempt, reply.retryAfter, reply.status === 429));
        continue;
      }
      return this.decode<T>(reply, method, path);
    }
  }

  /**
   * Sends and reads the whole body: the timeout covers both, so a stalled body is a network error too.
   * Returns undefined when the network failed and a retry is allowed.
   */
  private async attempt(
    url: string,
    init: RequestInit,
    idempotent: boolean,
    more: boolean,
    timeoutMs: number,
  ): Promise<Reply | undefined> {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      return { status: res.status, retryAfter: res.headers.get("Retry-After"), text };
    } catch (err) {
      if (idempotent && more) return undefined;
      // A write may have reached TestRail before the connection failed, so a blind retry could duplicate it.
      const message = idempotent
        ? `Could not reach ${this.creds.baseUrl}`
        : `Lost the connection to ${this.creds.baseUrl}; the change may or may not have been saved. Check before retrying.`;
      throw new CliError("NETWORK_ERROR", message, networkReason(err, timeoutMs));
    }
  }

  private decode<T>(reply: Reply, method: string, path: string): T {
    const { status, text } = reply;
    const parsed = parseJson(text);
    const reason = errorText(parsed);
    const field = reason === undefined ? undefined : /^Field :(\w+)/.exec(reason)?.[1];
    if (status === 401) {
      throw new CliError(
        "AUTH_FAILED",
        "TestRail rejected the credentials (check email, API key, and URL).",
        reason ?? "Repeated failed logins can lock the TestRail account.",
        status,
      );
    }
    if (status === 403) {
      throw new CliError(
        "FORBIDDEN",
        reason ?? `Your account lacks permission for ${method} ${path}`,
        "If the API is off, an admin can enable it under Administration > Site Settings > API.",
        status,
      );
    }
    if (status === 404) {
      throw new CliError("NOT_FOUND", reason ?? `TestRail has no resource at ${path}`, undefined, status);
    }
    if (status < 200 || status > 299) {
      // A 400 for an unknown id ("Field :case_id is not a valid test case.") stays TESTRAIL_ERROR here;
      // services turn it into a domain code with notFoundAs, which knows which field is the path id.
      throw new CliError(
        "TESTRAIL_ERROR",
        reason ?? `${method} ${path} returned ${status}`,
        reason === undefined ? text.slice(0, MAX_RAW_DETAIL_CHARS) : undefined,
        status,
        field,
      );
    }
    if (text.trim() === "") return undefined as T;
    if (parsed === undefined) {
      throw new CliError(
        "INVALID_RESPONSE",
        `${method} ${path} did not return JSON. Is ${this.creds.baseUrl} a TestRail site?`,
      );
    }
    return parsed as T;
  }

  private backoff(attempt: number, retryAfter?: string | null, rateLimited = false): number {
    const fromHeader = retryAfterMs(retryAfter);
    if (fromHeader !== undefined) return Math.min(fromHeader, MAX_RETRY_AFTER_MS);
    // TestRail limits per minute, so a 429 without Retry-After waits for most of the window.
    if (rateLimited) return RATE_LIMIT_WAIT_MS;
    const exponential = BASE_DELAY_MS * 2 ** attempt;
    const jitter = Math.random() * BASE_DELAY_MS;
    return Math.min(exponential + jitter, MAX_DELAY_MS);
  }
}

/** "/api/v2/get_cases/1&suite_id=2&limit=250". */
function apiPath(endpoint: string, params: Params = {}): string {
  const query = Object.entries(params)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, value]) => `&${encodeURIComponent(key)}=${encodeURIComponent(toParam(value))}`)
    .join("");
  return `/api/v2/${endpoint}${query}`;
}

function toParam(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

/** TestRail errors look like {"error": "Field :case_id is not a valid test case."}. */
function errorText(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const { error } = body as { error: unknown };
  return typeof error === "string" && error.trim() ? error : undefined;
}

/** Retry-After as seconds or an HTTP date, in ms from now. */
function retryAfterMs(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

/** undici reports "fetch failed"; the real reason (DNS, TLS, refused) is in `cause`. */
function networkReason(err: unknown, timeoutMs: number): string {
  if (err instanceof Error && err.name === "TimeoutError") {
    return `No answer after ${timeoutMs / 1000}s`;
  }
  const cause = err instanceof Error ? err.cause : undefined;
  if (cause instanceof Error) return `${err instanceof Error ? err.message : String(err)}: ${cause.message}`;
  return String(err);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
