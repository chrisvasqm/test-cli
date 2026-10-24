import { notFound, notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { ALL, collectPages, type Collected } from "../core/paging.js";
import type { Report, ReportRun } from "../core/testrail-types.js";

/**
 * get_reports and run_report endpoints. Only templates made in the UI with "On-demand via the API"
 * on are listed. Plans or roles without API reports get TestRail's 403 (FORBIDDEN) as is.
 */
export class ReportService {
  constructor(private readonly http = HttpClient.get()) {}

  list(projectId: number): Promise<Collected<Report>> {
    return collectPages<Report>(`get_reports/${projectId}`, "reports", {}, ALL, this.http).catch(
      notFound.project(projectId),
    );
  }

  /** Makes the report now; TestRail keeps it and returns its links. */
  run(id: number): Promise<ReportRun> {
    return this.http
      .get<ReportRun>(`run_report/${id}`)
      .catch(
        notFoundAs(
          "report_id",
          "REPORT_NOT_FOUND",
          `Report ${id} does not exist, is not on-demand via the API, or you cannot see it.`,
        ),
      );
  }
}
