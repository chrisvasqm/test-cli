import type { Command } from "commander";
import { provider } from "../../providers/index.js";
import { intInRange } from "../../core/args.js";
import { registerDeleteAction } from "../action.js";

export function registerDelete(section: Command): void {
  registerDeleteAction(section, {
    usage: "delete <section>",
    description: "Delete a section, its child sections and all their cases; TestRail has no undo",
    parseId: (raw) => intInRange(raw, "<section>", 1),
    service: () => provider().sections,
    key: "name",
    ref: (id) => `section ${id}`,
    question: (id, found) =>
      `Delete section ${id} "${found.name}" with its child sections and all their cases? This cannot be undone.`,
  });
}
