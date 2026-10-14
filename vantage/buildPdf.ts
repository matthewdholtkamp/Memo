// ArmyMemo PDF engine (pdf-lib). Port of buildDocx.ts: same layout, page by page, in points.
// Letter page 612 x 792 pt, 1 in margins, letterhead header at 0.5 in, continuation header/footer.
import { PDFDocument, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { MemoSpec, ParagraphNode } from "../model/memoSpec";
import { validateMemo } from "../validation/validate";
import { paragraphLabel } from "./format";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72;
const HEADER_TOP = 36; // 0.5 in header distance
const FOOTER_BOTTOM = 36; // 0.5 in footer distance
const CONTENT_W = PAGE_W - 2 * MARGIN; // 468
const RIGHT = PAGE_W - MARGIN; // 540
const INDENT = 18; // 0.25 in
const SIG_X = MARGIN + 234; // 3.25 in from margin = page center
const BODY_SIZE = 12;
const LETTERHEAD_SIZE = 10;
const LINE_FACTOR = 1.15; // Word single spacing for Arial / Times New Roman
const ASCENT_FACTOR = 0.905;
const PARA_AFTER = 10; // 200 twips
const SEAL_X = 36;
const SEAL_TOP = 36;
const SEAL_SIZE = 72; // 1 in
const BODY_BOTTOM = PAGE_H - MARGIN; // 720

type Fonts = { regular: PDFFont; bold: PDFFont };
type Line = { text: string; x: number; width: number; bold?: boolean; align?: "left" | "right" | "center"; size?: number };
// A block is a set of lines laid out top-down; `keep` blocks never split across pages.
// `reserve` is extra height (e.g. the signature block) that must land on the same page as this block.
type Block = { lines: Line[]; after: number; keep: boolean; keepWithNext?: boolean; columns?: Line[][]; reserve?: number };

const lineHeight = (size: number) => size * LINE_FACTOR;

function makeSanitizer(font: PDFFont) {
  const cache = new Map<string, boolean>();
  const replacements: Record<string, string> = { "‑": "-", " ": " ", " ": " ", "​": "" };
  return (text: string): string =>
    Array.from(text)
      .map((ch) => {
        if (replacements[ch] !== undefined) return replacements[ch];
        if (!cache.has(ch)) {
          try {
            font.encodeText(ch);
            cache.set(ch, true);
          } catch {
            cache.set(ch, false);
          }
        }
        return cache.get(ch) ? ch : "?";
      })
      .join("");
}

// Wrap preserving interior double spaces (AR 25-50 two spaces after sentences).
function wrap(text: string, font: PDFFont, size: number, firstWidth: number, restWidth: number): string[] {
  const tokens = text.replace(/\t/g, " ").match(/\S+|\s+/g) ?? [""];
  const lines: string[] = [];
  let current = "";
  const limit = () => (lines.length === 0 ? firstWidth : restWidth);
  const fits = (value: string) => font.widthOfTextAtSize(value, size) <= limit() + 0.01;
  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      if (current) current += token;
      continue;
    }
    const candidate = current + token;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current.trim()) {
      lines.push(current.trimEnd());
      current = "";
    }
    let word = token;
    while (!fits(word)) {
      let cut = word.length - 1;
      while (cut > 1 && !fits(word.slice(0, cut))) cut -= 1;
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    current = word;
  }
  lines.push(current.trimEnd());
  return lines;
}

class Layout {
  doc: PDFDocument;
  fonts: Fonts;
  spec: MemoSpec;
  pages: PDFPage[] = [];
  y = 0; // distance from top of page
  firstBodyTop: number;
  contBodyTop: number;
  clean: (text: string) => string;

  constructor(doc: PDFDocument, fonts: Fonts, spec: MemoSpec, firstBodyTop: number, contBodyTop: number) {
    this.doc = doc;
    this.fonts = fonts;
    this.spec = spec;
    this.firstBodyTop = firstBodyTop;
    this.contBodyTop = contBodyTop;
    this.clean = makeSanitizer(fonts.regular);
    this.newPage();
  }

  newPage() {
    this.pages.push(this.doc.addPage([PAGE_W, PAGE_H]));
    this.y = this.pages.length === 1 ? this.firstBodyTop : this.contBodyTop;
  }

  get page() {
    return this.pages[this.pages.length - 1];
  }

  drawLine(page: PDFPage, line: Line, top: number) {
    const size = line.size ?? BODY_SIZE;
    const font = line.bold ? this.fonts.bold : this.fonts.regular;
    const text = this.clean(line.text);
    if (!text) return;
    const w = font.widthOfTextAtSize(text, size);
    const x = line.align === "right" ? line.x + line.width - w : line.align === "center" ? line.x + (line.width - w) / 2 : line.x;
    page.drawText(text, { x, y: PAGE_H - top - size * ASCENT_FACTOR, size, font });
  }

  blank(count = 1) {
    for (let i = 0; i < count; i += 1) {
      if (this.y + lineHeight(BODY_SIZE) > BODY_BOTTOM + 0.01) this.newPage();
      else this.y += lineHeight(BODY_SIZE);
    }
  }

  blockHeight(block: Block): number {
    if (block.columns) return Math.max(...block.columns.map((col) => col.length)) * lineHeight(BODY_SIZE);
    return block.lines.length * lineHeight(BODY_SIZE);
  }

  place(block: Block, next?: Block) {
    const lh = lineHeight(BODY_SIZE);
    const room = () => BODY_BOTTOM - this.y + 0.01;
    const height = this.blockHeight(block);
    const groupHeight =
      block.keepWithNext && next
        ? height + block.after + this.blockHeight(next)
        : block.reserve
          ? height + block.after + block.reserve
          : height;
    const pageCapacity = BODY_BOTTOM - this.contBodyTop;

    if (block.columns) {
      if (height > room() && height <= pageCapacity) this.newPage();
      const top = this.y;
      block.columns.forEach((col) => col.forEach((line, i) => this.drawLine(this.page, line, top + i * lh)));
      this.y = top + height + block.after;
      return;
    }

    if ((block.keep || block.keepWithNext) && groupHeight > room() && groupHeight <= pageCapacity) {
      this.newPage();
    }
    // Split with widow/orphan control (at least 2 lines on each side) when the block cannot fit.
    let index = 0;
    while (index < block.lines.length) {
      const fitCount = Math.floor(room() / lh);
      const remaining = block.lines.length - index;
      if (fitCount >= remaining) {
        block.lines.slice(index).forEach((line, i) => this.drawLine(this.page, line, this.y + i * lh));
        this.y += remaining * lh;
        index = block.lines.length;
        break;
      }
      let take = fitCount;
      if (remaining - take < 2) take = remaining - 2;
      if (take < 2) {
        this.newPage();
        continue;
      }
      block.lines.slice(index, index + take).forEach((line, i) => this.drawLine(this.page, line, this.y + i * lh));
      index += take;
      this.newPage();
    }
    this.y = Math.min(this.y + block.after, BODY_BOTTOM);
  }

  text(text: string, opts: { x?: number; width?: number; firstIndent?: number; bold?: boolean; align?: Line["align"] } = {}): Line[] {
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? RIGHT - x;
    const first = opts.firstIndent ?? 0;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    return wrap(this.clean(text), font, BODY_SIZE, width - first, width).map((value, i) => ({
      text: value,
      x: i === 0 ? x + first : x,
      width: i === 0 ? width - first : width,
      bold: opts.bold,
      align: opts.align
    }));
  }
}

function fullOfficeSymbol(spec: MemoSpec): string {
  const arims = spec.arimsRecordNumber.trim();
  return arims ? `${spec.officeSymbol.trim()} (${arims})` : spec.officeSymbol.trim();
}

function trimmedList(values: string[]): string[] {
  return values.map((v) => v.trim()).filter(Boolean);
}

function dataUrlBytes(dataUrl: string): { bytes: Uint8Array; type: "png" | "jpg" } | null {
  const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  return { bytes, type: match[1] === "png" ? "png" : "jpg" };
}

export async function buildPdf(spec: MemoSpec): Promise<Uint8Array> {
  const validation = validateMemo(spec);
  if (!validation.canGenerate) {
    throw new Error(`Cannot generate memorandum: ${validation.blockingErrors.map(({ label }) => label).join(", ")}`);
  }

  const doc = await PDFDocument.create();
  const fonts: Fonts =
    spec.font === "Times New Roman"
      ? { regular: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.TimesRomanBold) }
      : { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const clean = makeSanitizer(fonts.regular);

  // Letterhead lines (10 pt bold, centered); body starts below whichever is lower: margin or header.
  const lhLines = spec.letterhead.orgLines
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => wrap(clean(line), fonts.bold, LETTERHEAD_SIZE, CONTENT_W, CONTENT_W));
  const letterheadBottom = HEADER_TOP + lhLines.length * lineHeight(LETTERHEAD_SIZE);
  const subjectHeader = wrap(clean(`SUBJECT:  ${spec.subject.trim()}`), fonts.regular, BODY_SIZE, CONTENT_W, CONTENT_W);
  const contHeaderBottom = HEADER_TOP + (1 + subjectHeader.length) * lineHeight(BODY_SIZE);

  const L = new Layout(doc, fonts, spec, Math.max(MARGIN, letterheadBottom), Math.max(MARGIN, contHeaderBottom));
  const lh = lineHeight(BODY_SIZE);
  const blocks: Block[] = [];
  const push = (lines: Line[], after = 0, keep = false, keepWithNext = false) => blocks.push({ lines, after, keep, keepWithNext });
  const blankBlock = (n = 1) => {
    for (let i = 0; i < n; i += 1) blocks.push({ lines: [{ text: "", x: MARGIN, width: CONTENT_W }], after: 0, keep: false });
  };

  // ---- Heading ----
  blankBlock(3);
  if (spec.suspense?.trim()) {
    push(L.text(`S: ${spec.suspense.trim()}`, { bold: true, align: "right" }));
    blankBlock(1);
  }
  const half = CONTENT_W / 2;
  blocks.push({
    lines: [],
    after: 0,
    keep: true,
    columns: [
      L.text(fullOfficeSymbol(spec), { x: MARGIN, width: half }),
      L.text(spec.date.trim() || "[DATE]", { x: MARGIN + half, width: half, align: "right" })
    ]
  });
  blankBlock(2);
  trimmedList(spec.thru).forEach((recipient, i) => push(L.text(i === 0 ? `MEMORANDUM THRU ${recipient}` : `THRU ${recipient}`)));
  const addressees = trimmedList(spec.addressees);
  const useDistribution = trimmedList(spec.distribution).length > 0 || addressees.length > 5;
  if (spec.type === "mfr" || spec.type === "counseling") {
    push(L.text("MEMORANDUM FOR RECORD"));
  } else {
    push(L.text(useDistribution ? "MEMORANDUM FOR SEE DISTRIBUTION" : `MEMORANDUM FOR ${addressees[0] ?? ""}`));
    if (!useDistribution) addressees.slice(1).forEach((recipient) => push(L.text(recipient, { firstIndent: INDENT })));
  }
  blankBlock(1);
  push(L.text(`SUBJECT:  ${spec.subject.trim()}`));
  blankBlock(2);

  // ---- Body (numbered, block style: runover returns to left margin) ----
  const appendBody = (nodes: ParagraphNode[], depth = 0) => {
    nodes.forEach((node, index) => {
      push(L.text(`${paragraphLabel(depth, index + 1)}  ${node.text.trim()}`, { firstIndent: depth * INDENT }), PARA_AFTER, true);
      appendBody(node.children, depth + 1);
    });
  };
  appendBody(spec.paragraphs);

  // ---- Closing ----
  const sigLines = (x: number): Line[] => {
    const width = RIGHT - x;
    const lines: Line[] = [...L.text(spec.signature.name.trim().toUpperCase(), { x, width })];
    if (!spec.signature.civilian) lines.push(...L.text(spec.signature.rankBranch.trim(), { x, width }));
    trimmedList(spec.signature.title).forEach((title, i) => lines.push(...L.text(title, { x: x + (i === 0 ? 0 : INDENT), width: width - (i === 0 ? 0 : INDENT) })));
    return lines;
  };
  const authority = spec.authorityLine?.trim();
  if (authority) {
    blankBlock(1);
    // Authority line, the four blank signature lines, and the signature block stay together.
    const encl = trimmedList(spec.enclosures);
    const closingLines = Math.max(sigLines(SIG_X).length, encl.length ? encl.length + 1 : 0);
    blocks.push({ lines: L.text(authority.toUpperCase()), after: 4 * lh, keep: true, reserve: closingLines * lh });
  } else {
    blankBlock(4);
  }
  const enclosures = trimmedList(spec.enclosures);
  if (enclosures.length === 0) {
    push(sigLines(SIG_X), 0, true);
  } else {
    const left: Line[] =
      enclosures.length === 1
        ? [...L.text("Encl", { width: 234 - 6 }), ...L.text(enclosures[0], { width: 234 - 6 })]
        : [...L.text("Encls", { width: 234 - 6 }), ...enclosures.flatMap((e, i) => L.text(`${i + 1}. ${e}`, { width: 234 - 6 }))];
    blocks.push({ lines: [], after: 0, keep: true, columns: [left, sigLines(SIG_X)] });
  }

  // ---- Post-closing ----
  const cf = trimmedList(spec.cfRecipients);
  const distribution = trimmedList(spec.distribution).length ? trimmedList(spec.distribution) : addressees.length > 5 ? addressees : [];
  if (distribution.length) {
    blankBlock(1);
    push(L.text("DISTRIBUTION:"), 0, false, true);
    distribution.forEach((r) => push(L.text(r)));
  }
  if (cf.length) {
    blankBlock(1);
    push(L.text("CF:"), 0, false, true);
    cf.forEach((r) => push(L.text(r)));
  }
  if (spec.type === "counseling" && spec.acknowledgment) {
    blankBlock(1);
    push(L.text("ACKNOWLEDGMENT"), PARA_AFTER, false, true);
    push([...L.text(spec.acknowledgment.statement), ...spec.acknowledgment.signers.flatMap((s) => L.text(s.label))], 0, true);
  }

  // ---- Place blocks ----
  blocks.forEach((block, i) => {
    const isBlank = block.lines.length === 1 && block.lines[0].text === "" && !block.columns;
    if (isBlank) {
      // Blank lines never start a continuation page.
      if (L.y + lh > BODY_BOTTOM + 0.01) return;
      L.y += lh;
      return;
    }
    L.place(block, blocks[i + 1]);
  });

  // ---- Headers and footers ----
  const seal = spec.letterhead.sealImageDataUrl ? dataUrlBytes(spec.letterhead.sealImageDataUrl) : null;
  let sealImage: PDFImage | null = null;
  if (seal) sealImage = seal.type === "png" ? await doc.embedPng(seal.bytes) : await doc.embedJpg(seal.bytes);
  L.pages.forEach((page, index) => {
    if (index === 0) {
      if (sealImage) page.drawImage(sealImage, { x: SEAL_X, y: PAGE_H - SEAL_TOP - SEAL_SIZE, width: SEAL_SIZE, height: SEAL_SIZE });
      lhLines.forEach((text, i) =>
        L.drawLine(page, { text, x: MARGIN, width: CONTENT_W, bold: true, align: "center", size: LETTERHEAD_SIZE }, HEADER_TOP + i * lineHeight(LETTERHEAD_SIZE))
      );
      return;
    }
    L.drawLine(page, { text: fullOfficeSymbol(spec), x: MARGIN, width: CONTENT_W }, HEADER_TOP);
    subjectHeader.forEach((text, i) => L.drawLine(page, { text, x: MARGIN, width: CONTENT_W }, HEADER_TOP + (i + 1) * lh));
    L.drawLine(page, { text: String(index + 1), x: MARGIN, width: CONTENT_W, align: "center" }, PAGE_H - FOOTER_BOTTOM - lh);
  });

  doc.setTitle(spec.subject.trim() || "Army memorandum");
  doc.setSubject("Unsigned Army memorandum prepared in ArmyMemo (Vantage)");
  doc.setCreator("ArmyMemo (Vantage)");
  doc.setProducer("ArmyMemo (Vantage)");
  return doc.save();
}

export function memoPdfFilename(spec: MemoSpec): string {
  const subject =
    spec.subject
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 70) || "army-memorandum";
  return `${subject}.pdf`;
}
