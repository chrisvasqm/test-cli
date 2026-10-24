import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { suiteId } from "../../providers/testrail/ids.js";
import { registerDeleteAction } from "../action.js";

export function registerDelete(suite: Command): void {
  registerDeleteAction(suite, {
    usage: "delete <suite>",
    description: "Delete a suite with its sections, cases and tests, e.g. S3; TestRail has no undo",
    parseId: suiteId,
    needs: "suites",
    service: () => provider().suites,
    key: "name",
    ref: (id) => `S${id}`,
    question: (id, found) =>
      `Delete S${id} "${found.name}" with all its sections, cases and tests? This cannot be undone.`,
  });
}
