import type { Command } from "commander";
import { projectId, suiteId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { saveConfig } from "../../core/config.js";
import { CliError } from "../../core/errors.js";
import { printResult, table } from "../../core/output.js";
import { SUITE_MODE_SINGLE, type Suite } from "../../core/testrail-types.js";
import { ProjectService } from "../../services/project.service.js";

interface UseOptions {
  suite?: string;
}

export function registerUse(project: Command): void {
  project
    .command("use <project>")
    .description("Save the project (and suite) that commands use, e.g. P2")
    .option("--suite <suite>", "Suite for multi-suite projects, e.g. S3 (not needed with one suite)")
    .action(async (rawProject: string, opts: UseOptions, cmd: Command) => {
      const id = projectId(rawProject);
      const wantedSuite = opts.suite === undefined ? undefined : suiteId(opts.suite);
      const { config, configPath, mode } = bootstrap(cmd);
      const projects = new ProjectService();
      const found = await projects.get(id);
      const suite =
        found.suite_mode === SUITE_MODE_SINGLE
          ? undefined
          : pickSuite(await projects.suites(id), wantedSuite);
      if (found.suite_mode === SUITE_MODE_SINGLE && wantedSuite !== undefined) {
        throw new CliError("USAGE", `Project P${id} has a single suite; drop --suite.`);
      }
      const { suiteId: _old, ...rest } = config;
      saveConfig(
        configPath,
        suite ? { ...rest, projectId: id, suiteId: suite.id } : { ...rest, projectId: id },
      );
      const rows: [string, string][] = [
        ["Config", configPath],
        ["Project", `${found.name} (P${id})`],
      ];
      if (suite) rows.push(["Suite", `${suite.name} (S${suite.id})`]);
      printResult(
        mode,
        {
          path: configPath,
          project: { id, name: found.name },
          suite: suite ? { id: suite.id, name: suite.name } : null,
        },
        () => table(rows),
      );
    });
}

function pickSuite(suites: Suite[], wanted: number | undefined): Suite {
  const active = suites.filter((item) => !item.is_completed);
  if (wanted !== undefined) {
    const match = suites.find((item) => item.id === wanted);
    if (!match)
      throw new CliError("SUITE_NOT_FOUND", `Suite S${wanted} is not in this project.`, suiteList(active));
    return match;
  }
  if (active.length === 1) return active[0]!;
  if (active.length === 0) throw new CliError("NO_SUITES", "This project has no active suites.");
  throw new CliError(
    "SUITE_REQUIRED",
    "This project has several suites; pick one with --suite.",
    suiteList(active),
  );
}

function suiteList(suites: Suite[]): string[] {
  return suites.map((item) => `S${item.id}  ${item.name}`);
}
