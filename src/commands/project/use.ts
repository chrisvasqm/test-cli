import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { projectId, suiteId } from "../../providers/testrail/ids.js";
import { bootstrap } from "../../core/bootstrap.js";
import { configSchema, saveConfig } from "../../core/config.js";
import { InputError } from "../../core/errors.js";
import { printResult, table } from "../../core/output.js";
import { SUITE_MODE_SINGLE, type Suite } from "../../providers/testrail/types.js";
import { savedConfig } from "../render.js";

interface UseOptions {
  suite?: string;
}

export function registerUse(project: Command): void {
  project
    .command("use <project>")
    .description("Save the project (and suite) that commands use, e.g. P2")
    .option("-su, --suite <suite>", "Suite for multi-suite projects, e.g. S3 (not needed with one suite)")
    .action(async (rawProject: string, opts: UseOptions, cmd: Command) => {
      const id = projectId(rawProject);
      const wantedSuite = opts.suite === undefined ? undefined : suiteId(opts.suite);
      const { config, configPath, mode } = bootstrap(cmd);
      const { projects } = provider();
      const found = await projects.get(id);
      const single = found.suite_mode === SUITE_MODE_SINGLE;
      if (single && wantedSuite !== undefined) {
        throw new InputError("USAGE", `Project P${id} has a single suite; drop --suite.`);
      }
      const suite = single ? undefined : pickSuite(await projects.activeSuites(id), wantedSuite);
      saveConfig(configPath, configSchema.parse({ ...config, projectId: id, suiteId: suite?.id }));
      const { data, rows } = savedConfig(configPath, found, suite);
      printResult(mode, data, () => table(rows));
    });
}

function pickSuite(active: Suite[], wanted: number | undefined): Suite {
  if (wanted !== undefined) {
    const match = active.find((item) => item.id === wanted);
    if (!match) {
      throw new InputError(
        "SUITE_NOT_FOUND",
        `Suite S${wanted} is not an active suite of this project.`,
        suiteList(active),
      );
    }
    return match;
  }
  if (active.length === 1) return active[0]!;
  throw new InputError(
    "SUITE_REQUIRED",
    "This project has several suites; pick one with --suite.",
    suiteList(active),
  );
}

function suiteList(suites: Suite[]): string[] {
  return suites.map((item) => `S${item.id}  ${item.name}`);
}
