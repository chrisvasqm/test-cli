import { CAPABILITIES, type Capability } from "../capability.js";
import type { Provider } from "../provider.js";
import { HttpClient, type Credentials } from "./http.js";
import { AttachmentService } from "./services/attachment.service.js";
import { CaseService } from "./services/case.service.js";
import { ConfigurationService } from "./services/configuration.service.js";
import { LinkService } from "./services/link.service.js";
import { MetaService } from "./services/meta.service.js";
import { MilestoneService } from "./services/milestone.service.js";
import { PlanService } from "./services/plan.service.js";
import { ProjectService } from "./services/project.service.js";
import { ReportService } from "./services/report.service.js";
import { ResultService } from "./services/result.service.js";
import { RunService } from "./services/run.service.js";
import { SectionService } from "./services/section.service.js";
import { SuiteService } from "./services/suite.service.js";
import { TestService } from "./services/test.service.js";
import { UserService } from "./services/user.service.js";

/** One HTTP client for the site, and one instance of each service on it. */
export function createTestRail(creds: Credentials): Provider {
  const http = new HttpClient(creds);
  const cases = new CaseService(http);
  const plans = new PlanService(http);
  const runs = new RunService(http, plans);
  const tests = new TestService(http);
  const results = new ResultService(http, tests, runs, cases);
  return {
    label: "TestRail",
    /** TestRail has every optional feature. */
    capabilities: new Set<Capability>(CAPABILITIES),
    attachments: new AttachmentService(http, tests),
    cases,
    configurations: new ConfigurationService(http),
    links: new LinkService(cases, runs, tests, results),
    meta: new MetaService(http),
    milestones: new MilestoneService(http),
    plans,
    projects: new ProjectService(http),
    reports: new ReportService(http),
    results,
    runs,
    sections: new SectionService(http),
    suites: new SuiteService(http),
    tests,
    users: new UserService(http),
  };
}
