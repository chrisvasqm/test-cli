import { CAPABILITIES, type Capability } from "../capability.js";
import { HttpClient } from "./http.js";
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

export interface TestRailCredentials {
  baseUrl: string;
  email: string;
  apiKey: string;
}

/** Configures the HTTP client for the site and builds one instance of each service on it. */
export function createTestRail(creds: TestRailCredentials) {
  HttpClient.configure(creds);
  return {
    name: "testrail",
    label: "TestRail",
    /** TestRail has every optional feature. */
    capabilities: new Set<Capability>(CAPABILITIES),
    attachments: new AttachmentService(),
    cases: new CaseService(),
    configurations: new ConfigurationService(),
    links: new LinkService(),
    meta: new MetaService(),
    milestones: new MilestoneService(),
    plans: new PlanService(),
    projects: new ProjectService(),
    reports: new ReportService(),
    results: new ResultService(),
    runs: new RunService(),
    sections: new SectionService(),
    suites: new SuiteService(),
    tests: new TestService(),
    users: new UserService(),
  } as const;
}

export type TestRailProvider = ReturnType<typeof createTestRail>;
