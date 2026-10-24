import { openAsBlob } from "node:fs";
import { CliError, notFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import type { Upload } from "../core/input.js";
import { collectPages, type Collected } from "../core/paging.js";
import type { Attachment } from "../core/testrail-types.js";
import { TestService } from "./test.service.js";

/** What a file can be attached to. A test has no attachments of its own; they go on its results. */
export type AttachTarget = { kind: "case" | "run" | "result"; id: number };

/** Whose attachments to list; a test's are those on its results. */
export type AttachmentsOf = { kind: "case" | "run" | "test"; id: number };

const notFoundFor = { case: notFound.case, run: notFound.run, test: notFound.test, result: notFound.result };

/** add_attachment_to_* and get_attachments_for_* endpoints. */
export class AttachmentService {
  constructor(private readonly http = HttpClient.get()) {}

  /** One file per request, as TestRail takes them. The id is a number on older servers, a UUID on Cloud. */
  async add(target: AttachTarget, upload: Upload): Promise<number | string> {
    const form = new FormData();
    // The third argument is the stored name; without it TestRail calls the file "blob".
    form.append("attachment", await openAsBlob(upload.path), upload.name);
    const added = await this.http
      .postForm<{ attachment_id: number | string }>(`add_attachment_to_${target.kind}/${target.id}`, form)
      .catch(notFoundFor[target.kind](target.id));
    return added.attachment_id;
  }

  /**
   * Uploads in order, one at a time. A failure says which files are already attached, since a
   * plain retry would attach them twice.
   */
  async addAll(target: AttachTarget, uploads: readonly Upload[]): Promise<(number | string)[]> {
    const ids: (number | string)[] = [];
    for (const upload of uploads) {
      const id = await this.add(target, upload).catch((err: unknown) => {
        if (ids.length === 0 || !(err instanceof CliError)) throw err;
        const done = uploads.slice(0, ids.length).map((item) => item.name);
        throw new CliError(
          err.code,
          `${err.message} Already attached: ${done.join(", ")}; retry only the rest.`,
          { attached: ids, error: err.details },
          err.status,
          err.field,
        );
      });
      ids.push(id);
    }
    return ids;
  }

  list(of: AttachmentsOf, limit: number): Promise<Collected<Attachment>> {
    return collectPages<Attachment>(
      `get_attachments_for_${of.kind}/${of.id}`,
      "attachments",
      {},
      limit,
      this.http,
    ).catch(notFoundFor[of.kind](of.id));
  }

  /** The id of a test's newest result, or of `resultId` after checking it belongs to the test. */
  async resultOf(testId: number, resultId?: number): Promise<number> {
    const tests = new TestService(this.http);
    if (resultId === undefined) {
      const { items } = await tests.results(testId, 1);
      if (items[0]) return items[0].id;
      throw new CliError(
        "TEST_HAS_NO_RESULTS",
        `Test T${testId} has no results to attach to; add one first.`,
      );
    }
    const { items } = await tests.results(testId, Number.MAX_SAFE_INTEGER);
    if (items.some((item) => item.id === resultId)) return resultId;
    throw new CliError("RESULT_NOT_IN_TEST", `Result #${resultId} is not a result of test T${testId}.`);
  }
}
