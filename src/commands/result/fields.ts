import { CliError } from "../../core/errors.js";
import { splitRefs } from "../../core/text.js";
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
}

/** Turns typed fields into TestRail's add_result body; `where` names the input in errors. */
export async function toResultInput(
  fields: ResultFields,
  meta: MetaService,
  where: string,
): Promise<ResultInput> {
  const input: ResultInput = {};
  if (fields.status !== undefined) {
    const ids = await meta.statusIds(fields.status);
    if (ids.length !== 1) throw new CliError("USAGE", `${where}: give exactly one status`);
    const status = (await meta.statuses()).find((item) => item.id === ids[0]);
    // TestRail refuses "Untested" as a result: it is only the state before any result.
    if (status?.is_untested)
      throw new CliError("USAGE", `${where}: ${status.label} cannot be set as a result`);
    input.status_id = ids[0]!;
  }
  if (fields.comment !== undefined) input.comment = fields.comment;
  const defects = Array.isArray(fields.defects) ? fields.defects : splitRefs(fields.defects);
  if (defects.length > 0) input.defects = defects.join(",");
  if (fields.elapsed !== undefined) {
    if (!ELAPSED.test(fields.elapsed.trim())) {
      throw new CliError("USAGE", `${where}: elapsed must look like 30s, 1m 45s or 2h`);
    }
    input.elapsed = fields.elapsed.trim();
  }
  if (fields.version !== undefined) input.version = fields.version;
  if (input.status_id === undefined && input.comment === undefined && input.defects === undefined) {
    throw new CliError("USAGE", `${where}: give a status, a comment or defects`);
  }
  return input;
}
