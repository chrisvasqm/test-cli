import { InputError } from "../../core/errors.js";
import { joinRefs } from "../../core/text.js";
import type { ResultInput } from "../../services/result.service.js";
import type { MetaService } from "../../services/meta.service.js";

/** TestRail's timespan format: "30s", "1m 45s", "2h 30m", "1w 2d". */
const ELAPSED = /^(\d+\s*[wdhms]\s*)+$/i;

export interface ResultFields {
  status?: string | undefined;
  comment?: string | undefined;
  defects?: string | string[] | undefined;
  elapsed?: string | undefined;
  version?: string | undefined;
  /** A user id, already resolved. */
  assignedToId?: number | undefined;
}

/** Turns typed fields into TestRail's add_result body; `where` names the input in errors. */
export async function toResultInput(
  fields: ResultFields,
  meta: MetaService,
  where: string,
): Promise<ResultInput> {
  const input: ResultInput = {};
  if (fields.status !== undefined) {
    const status = await meta.status(fields.status);
    // TestRail refuses "Untested" as a result: it is only the state before any result.
    if (status.is_untested)
      throw new InputError("USAGE", `${where}: ${status.label} cannot be set as a result`);
    input.status_id = status.id;
  }
  if (fields.comment !== undefined) input.comment = fields.comment;
  const defects = joinRefs(fields.defects);
  if (defects) input.defects = defects;
  if (fields.elapsed !== undefined) {
    if (!ELAPSED.test(fields.elapsed.trim())) {
      throw new InputError("USAGE", `${where}: elapsed must look like 30s, 1m 45s or 2h`);
    }
    input.elapsed = fields.elapsed.trim();
  }
  if (fields.version !== undefined) input.version = fields.version;
  if (fields.assignedToId !== undefined) input.assignedto_id = fields.assignedToId;
  // TestRail: "One of Status ID, Assigned To or Comment is required"; defects alone are refused.
  if (input.status_id === undefined && input.comment === undefined && input.assignedto_id === undefined) {
    throw new InputError("USAGE", `${where}: give a status, a comment or an assignee`);
  }
  return input;
}
