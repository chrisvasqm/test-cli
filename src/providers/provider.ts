/**
 * What commands need from a test management tool: one service per group of endpoints, holding only
 * the methods commands call. A provider implements each one; optional features (capability.ts) are
 * still members, and the registry makes them throw NOT_SUPPORTED when the provider lacks them.
 * Records still use TestRail's shapes; neutral ones arrive with the second provider (Qase).
 */
import type { Collected } from "../core/paging.js";
import type { Upload } from "../core/input.js";
import type { Capability } from "./capability.js";
import type {
  Attachment,
  Case,
  ConfigGroup,
  Milestone,
  Named,
  Plan,
  PlanEntry,
  Project,
  Report,
  ReportRun,
  Result,
  Run,
  Section,
  Status,
  Suite,
  Template,
  Test,
  User,
} from "./testrail/types.js";
import type {
  AttachTarget,
  AttachmentsOf,
  CaseFilter,
  CaseInput,
  EditableRun,
  LinkTarget,
  MilestoneInput,
  MilestoneUpdate,
  OpenRun,
  PlanEntryInput,
  PlanInput,
  RefsTarget,
  ResultInput,
  ResultTarget,
  RunChange,
  RunFilter,
  RunInput,
  RunResult,
  SectionInput,
  SectionMove,
  SuiteInput,
} from "./types.js";

/** A service whose records can be deleted by id. */
export interface Removable {
  remove(id: number): Promise<void>;
}

export interface Projects {
  listActive(): Promise<Collected<Project>>;
  get(id: number): Promise<Project>;
  suites(projectId: number): Promise<Suite[]>;
  activeSuites(projectId: number): Promise<Suite[]>;
}

export interface Cases extends Removable {
  get(id: number): Promise<Case>;
  getMany(ids: number[]): Promise<Case[]>;
  list(filter: CaseFilter): Promise<Collected<Case>>;
  withRef(filter: Omit<CaseFilter, "refs" | "limit">, key: string): Promise<Case[]>;
  linkedTo(projectId: number, suiteId: number | undefined, key: string): Promise<number[]>;
  linkedToEach(
    projectId: number,
    suiteId: number | undefined,
    keys: readonly string[],
  ): Promise<Map<string, Case[]>>;
  add(sectionId: number, input: CaseInput & { title: string }): Promise<Case>;
  update(id: number, input: CaseInput): Promise<Case>;
  updateMany(suiteId: number, ids: number[], input: CaseInput): Promise<void>;
  copyTo(sectionId: number, ids: number[]): Promise<void>;
  moveTo(sectionId: number, suiteId: number, ids: number[]): Promise<void>;
}

export interface Sections extends Removable {
  get(id: number): Promise<Section>;
  list(projectId: number, suiteId: number | undefined, limit: number): Promise<Collected<Section>>;
  add(projectId: number, input: SectionInput): Promise<Section>;
  update(id: number, input: Partial<Pick<SectionInput, "name" | "description">>): Promise<Section>;
  move(id: number, input: SectionMove): Promise<Section>;
}

export interface Suites extends Removable {
  get(id: number): Promise<Suite>;
  add(projectId: number, input: SuiteInput): Promise<Suite>;
  update(id: number, input: Partial<SuiteInput>): Promise<Suite>;
}

export interface Runs extends Removable {
  get(id: number): Promise<Run>;
  list(projectId: number, limit: number, filter?: RunFilter): Promise<Collected<Run>>;
  allOpen(projectId: number, milestoneId?: number): Promise<OpenRun[]>;
  withRef(projectId: number, suiteId: number | undefined, key: string): Promise<Run[]>;
  add(projectId: number, input: RunInput): Promise<Run>;
  open(id: number, known?: Run): Promise<Run>;
  editable(id: number, known?: Run): Promise<EditableRun>;
  update(target: EditableRun, input: RunChange): Promise<Run>;
  assertChangeable(target: EditableRun, input: RunChange): void;
  close(id: number, known?: Run): Promise<Run>;
  assertClosable(run: Run): void;
}

export interface Tests {
  get(id: number): Promise<Test>;
  all(runId: number, statusIds?: number[]): Promise<Test[]>;
  list(runId: number, statusIds: number[], limit: number, assignedTo?: number): Promise<Collected<Test>>;
  assigned(runIds: readonly number[], statusIds: number[], assignedTo: number): Promise<Test[]>;
  results(testId: number, limit: number): Promise<Collected<Result>>;
}

export interface Results {
  addForTest(testId: number, input: ResultInput): Promise<Result>;
  addForCase(runId: number, caseId: number, input: ResultInput): Promise<Result>;
  addForCases(runId: number, results: (ResultInput & { case_id: number })[]): Promise<Result[]>;
  forCase(runId: number, caseId: number, limit: number): Promise<Collected<Result>>;
  forRun(runId: number): Promise<Collected<Result>>;
  history(runs: Run[], caseId: number, limit: number): Promise<Collected<RunResult>>;
  openTest(target: ResultTarget): Promise<Test>;
}

/** Jira keys on cases, runs and tests. */
export interface Links {
  load(target: LinkTarget): Promise<{ keys: string[]; runId?: number; run?: Run }>;
  add(
    target: LinkTarget,
    loaded: { keys: readonly string[]; run?: Run },
    added: readonly string[],
  ): Promise<void>;
  setRefs(target: RefsTarget, refs: readonly string[], run?: Run): Promise<void>;
  assertWritable(loaded: { runId?: number; run?: Run }): Promise<void>;
}

/** Statuses, priorities, case types and templates. */
export interface Meta {
  statuses(): Promise<Status[]>;
  priorities(): Promise<Named[]>;
  caseTypes(): Promise<Named[]>;
  templates(projectId: number): Promise<Template[]>;
  status(typed: string): Promise<Status>;
  openStatusIds(): Promise<number[]>;
  statusIds(typed: string): Promise<number[]>;
}

export interface Users {
  byEmail(email: string): Promise<User>;
  names(ids: number[]): Promise<Map<number, string>>;
  list(projectId: number): Promise<Collected<User>>;
  resolve(assignee: string, myEmail: string, flag: string): Promise<User>;
  resolveOptional(assignee: string | undefined, myEmail: string, flag: string): Promise<User | undefined>;
}

export interface Plans extends Removable {
  get(id: number): Promise<Plan>;
  list(projectId: number, completed: boolean, limit: number, milestoneId?: number): Promise<Collected<Plan>>;
  add(projectId: number, input: PlanInput): Promise<Plan>;
  addEntry(id: number, input: PlanEntryInput): Promise<PlanEntry>;
  close(id: number): Promise<Plan>;
}

export interface Milestones extends Removable {
  get(id: number): Promise<Milestone>;
  list(projectId: number, completed: boolean, limit: number): Promise<Collected<Milestone>>;
  add(projectId: number, input: MilestoneInput): Promise<Milestone>;
  update(id: number, input: MilestoneUpdate): Promise<Milestone>;
}

export interface Configurations {
  groups(projectId: number): Promise<ConfigGroup[]>;
}

export interface Reports {
  list(projectId: number): Promise<Collected<Report>>;
  run(id: number): Promise<ReportRun>;
}

export interface Attachments {
  addAll(target: AttachTarget, uploads: readonly Upload[]): Promise<(number | string)[]>;
  list(of: AttachmentsOf, limit: number): Promise<Collected<Attachment>>;
  resultOf(testId: number, resultId?: number): Promise<number>;
}

export interface Provider {
  /** The tool's name in messages, e.g. "TestRail". */
  readonly label: string;
  readonly capabilities: ReadonlySet<Capability>;
  readonly projects: Projects;
  readonly cases: Cases;
  readonly sections: Sections;
  readonly runs: Runs;
  readonly tests: Tests;
  readonly results: Results;
  readonly links: Links;
  readonly meta: Meta;
  readonly users: Users;
  readonly suites: Suites;
  readonly plans: Plans;
  readonly milestones: Milestones;
  readonly configurations: Configurations;
  readonly reports: Reports;
  readonly attachments: Attachments;
}
