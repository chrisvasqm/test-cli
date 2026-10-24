import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { caseId } from "../../providers/testrail/ids.js";
import { registerDeleteAction } from "../action.js";

export function registerDelete(testCase: Command): void {
  registerDeleteAction(testCase, {
    usage: "delete <case>",
    description: "Delete a case and its tests in active runs, e.g. C12; TestRail has no undo",
    parseId: caseId,
    service: () => provider().cases,
    key: "title",
    ref: (id) => `C${id}`,
    question: (id, found) =>
      `Delete C${id} "${found.title}" and its tests and results in active runs? This cannot be undone.`,
  });
}
