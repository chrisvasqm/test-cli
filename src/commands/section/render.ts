import type { Section } from "../../providers/testrail/types.js";

/** What create, edit and move print for the section TestRail returns. */
export function toSectionView(section: Section) {
  return {
    id: section.id,
    name: section.name,
    description: section.description,
    parentId: section.parent_id,
    depth: section.depth,
  };
}
