import type { Command } from "commander";
import { suiteId } from "../../core/args.js";
import { SuiteService } from "../../services/suite.service.js";
import { registerDeleteAction } from "../action.js";

export function registerDelete(suite: Command): void {
  registerDeleteAction(suite, {
    usage: "delete <suite>",
    description: "Delete a suite with its sections, cases and tests, e.g. S3; TestRail has no undo",
    parseId: suiteId,
    service: () => new SuiteService(),
    key: "name",
    ref: (id) => `S${id}`,
    question: (id, found) =>
      `Delete S${id} "${found.name}" with all its sections, cases and tests? This cannot be undone.`,
  });
}
