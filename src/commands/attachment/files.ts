import type { Upload } from "../../core/input.js";

const UNITS = ["B", "KB", "MB", "GB"];
const STEP = 1024;

/** "21.5 KB". */
export function fileSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= STEP && unit < UNITS.length - 1) {
    value /= STEP;
    unit++;
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${UNITS[unit]}`;
}

export interface AttachedFile {
  /** A number on older servers, a UUID on TestRail Cloud. */
  id: number | string;
  name: string;
  size: number;
}

/** The uploaded files with the ids TestRail gave them, in the same order. */
export function attached(uploads: readonly Upload[], ids: readonly (number | string)[]): AttachedFile[] {
  return uploads.map((upload, index) => ({ id: ids[index]!, name: upload.name, size: upload.size }));
}

/** "Attached to C12:" and one line per file. */
export function renderAttached(name: string, files: readonly AttachedFile[]): string {
  const lines = files.map((file) => `  ${file.name}  ${fileSize(file.size)}  (id ${file.id})`);
  return [`Attached to ${name}:`, ...lines].join("\n");
}
