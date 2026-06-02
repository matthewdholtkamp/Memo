import type { MemoSpec } from "../model/memoSpec";

function sanitizeFilePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 70);
}

export function memoFilename(spec: MemoSpec): string {
  const subject = sanitizeFilePart(spec.subject) || "army-memorandum";
  const date = sanitizeFilePart(spec.date) || "DATE";
  return `${subject}-${date}.docx`;
}

export async function downloadDocx(spec: MemoSpec): Promise<void> {
  const { buildDocx } = await import("./buildDocx");
  const blob = await buildDocx(spec);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = memoFilename(spec);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
