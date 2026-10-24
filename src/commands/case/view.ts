import type { Command } from "commander";
import { caseId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, table } from "../../core/output.js";
import { splitList } from "../../core/text.js";
import { CaseService } from "../../services/case.service.js";
import { MetaService, nameOf } from "../../services/meta.service.js";
import { SectionService } from "../../services/section.service.js";
import { caseUrl, isoTime, localTime, renderContent, toContent } from "../render.js";

export function registerView(testCase: Command): void {
  testCase
    .command("view <case>")
    .description("Show a case's details, preconditions and steps, e.g. C12")
    .action(async (rawId: string, _opts: unknown, cmd: Command) => {
      const id = caseId(rawId);
      const { config, mode } = bootstrap(cmd);
      const cases = new CaseService();
      const meta = new MetaService();
      // The lookups do not depend on the case, so they run alongside it; only the section waits.
      const lookups = Promise.all([meta.priorities(), meta.caseTypes()]);
      const found = await cases.get(id);
      const [section, [priorities, types]] = await Promise.all([
        new SectionService().get(found.section_id).catch(() => undefined),
        lookups,
      ]);
      const view = {
        id: found.id,
        title: found.title,
        url: caseUrl(config, found.id),
        section: { id: found.section_id, name: section?.name ?? null },
        suiteId: found.suite_id,
        priority: nameOf(priorities, found.priority_id),
        type: nameOf(types, found.type_id),
        refs: splitList(found.refs),
        estimate: found.estimate,
        created: isoTime(found.created_on),
        updated: isoTime(found.updated_on),
        ...toContent(found),
      };
      printResult(mode, view, () => {
        const rows: [string, string][] = [
          [
            "Section",
            view.section.name ? `${view.section.name} (#${view.section.id})` : `#${view.section.id}`,
          ],
          ["Priority", view.priority ?? "none"],
          ["Type", view.type ?? "none"],
        ];
        if (view.refs.length > 0) rows.push(["Refs", view.refs.join(", ")]);
        if (view.estimate) rows.push(["Estimate", view.estimate]);
        rows.push(["Updated", localTime(view.updated)], ["URL", view.url]);
        return [`C${view.id}  ${view.title}`, table(rows), ...renderContent(view)].join("\n\n");
      });
    });
}
