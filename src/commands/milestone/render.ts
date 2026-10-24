import { splitList } from "../../core/text.js";
import type { Milestone } from "../../core/testrail-types.js";
import { isoTime, localDate, localTime } from "../render.js";

/** The milestone fields view, create, edit, close and reopen print. */
export function toMilestoneView(found: Milestone) {
  return {
    id: found.id,
    name: found.name,
    url: found.url,
    description: found.description,
    parentId: found.parent_id,
    refs: splitList(found.refs),
    start: isoTime(found.start_on),
    due: isoTime(found.due_on),
    started: found.is_started,
    completed: found.is_completed,
    completedOn: isoTime(found.completed_on),
  };
}

/** Key/value rows for a milestone; the caller adds the heading and description. */
export function milestoneRows(view: ReturnType<typeof toMilestoneView>): [string, string][] {
  const rows: [string, string][] = [
    ["State", view.completed ? `completed ${localTime(view.completedOn)}` : "open"],
    ["Start", localDate(view.start)],
    ["Due", localDate(view.due)],
  ];
  if (view.parentId !== null) rows.push(["Parent", `M${view.parentId}`]);
  if (view.refs.length > 0) rows.push(["Refs", view.refs.join(", ")]);
  rows.push(["URL", view.url]);
  return rows;
}
