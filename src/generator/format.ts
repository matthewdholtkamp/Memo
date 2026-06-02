export const DXA_PER_INCH = 1440;
export const PAGE_WIDTH = 12240;
export const PAGE_HEIGHT = 15840;
export const MARGIN = DXA_PER_INCH;
export const HEADER_FOOTER_MARGIN = 720;
export const CONTENT_WIDTH = 9360;
export const INDENT_STEP = 360;
export const SIGNATURE_LEFT = 4680;
export const SINGLE_LINE = 240;
export const PARAGRAPH_AFTER = 200;
export const MAX_NUMBERING_DEPTH = 5;

export function paragraphLabel(depth: number, ordinal: number): string {
  const letter = String.fromCharCode(96 + Math.min(ordinal, 26));
  if (depth === 0) return `${ordinal}.`;
  if (depth === 1) return `${letter}.`;
  if (depth === 2) return `(${ordinal})`;
  if (depth === 3) return `(${letter})`;
  if (depth === 4) return `${ordinal})`;
  return `${letter})`;
}
