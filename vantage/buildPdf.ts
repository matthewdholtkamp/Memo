// ArmyMemo PDF engine (pdf-lib), built to AR 25-50 (10 Oct 2020, admin revision 4 Oct 2024),
// chapter 2, figures 2-1 through 2-17, chapter 4 (enclosures) and paragraph 6-4 (signature block).
// Letterhead geometry is measured from the APD letterhead template as it prints on real
// signed memorandums. All positions are PDF points from the TOP of the page (72 pt = 1 inch).
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB
} from "pdf-lib";
import type { MemoSpec, ParagraphNode } from "../model/memoSpec";
import { validateMemo } from "../validation/validate";
import { paragraphLabel } from "./format";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72; // 1 inch left, right, bottom; continuation pages start 1 inch from the top
const RIGHT = PAGE_W - MARGIN;
const CONTENT_W = RIGHT - MARGIN; // 468
const BODY_SIZE = 12;
const LH = 13.8; // one single-spaced line of 12-point Arial or Times New Roman
const BASELINE = 10.9; // distance from a line's top to its baseline
const INDENT = 18; // 1/4 inch
const SIG_X = PAGE_W / 2; // signature block begins at the center of the page
const ENCL_W = SIG_X - MARGIN - 12; // enclosure column, left of the signature block
const BODY_BOTTOM = PAGE_H - MARGIN; // 1-inch bottom margin
const PAGE_NUMBER_TOP = BODY_BOTTOM; // centered, approximately 1 inch from the bottom
const SEAL_X = 36; // seal: 1 inch, 1/2 inch from the left and top edges
const SEAL_TOP = 36;
const SEAL_SIZE = 72;
const OFFICE_TOP_LETTERHEAD = SEAL_TOP + SEAL_SIZE + 2 * LH; // office symbol: second line below the seal
const BLACK = rgb(0, 0, 0);
// Subparagraph first-line indent by level: 1. at the margin, a. 1/4 in, (1) 1/2 in, (a) 1/2 in
// ("Do not indent any further than the second subdivision" - fig 2-1).
const LEVEL_INDENT = [0, INDENT, 2 * INDENT, 2 * INDENT];

type Fonts = { regular: PDFFont; bold: PDFFont; lhBold: PDFFont; lhRegular: PDFFont };
type Seg = { text: string; x: number; width: number; bold?: boolean; align?: "left" | "right" | "center" };
type Row = Seg[];
type Block = {
  rows: Row[];
  gap: number; // blank lines before the block (dropped at the top of a continuation page)
  splittable?: boolean; // body paragraphs of 4+ lines may split, 2+ lines on each page
  keepWithNext?: boolean; // keep with the first line of the next block
  lastBody?: boolean; // last body paragraph: carries 2+ lines onto the closing's page
  closing?: boolean;
};

function makeSanitizer(font: PDFFont) {
  const cache = new Map<string, boolean>();
  const swaps: Record<string, string> = { "‑": "-", " ": " ", " ": " ", "​": "" };
  return (text: string): string =>
    Array.from(text)
      .map((ch) => {
        if (swaps[ch] !== undefined) return swaps[ch];
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

// Word wrap that keeps interior double spaces (two spaces after periods and question marks).
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
    if (fits(current + token)) {
      current += token;
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

const trimmedList = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);

function fullOfficeSymbol(spec: MemoSpec): string {
  const arims = spec.arimsRecordNumber.trim();
  return arims ? `${spec.officeSymbol.trim()} (${arims})` : spec.officeSymbol.trim();
}

function dataUrlBytes(dataUrl: string): { bytes: Uint8Array; type: "png" | "jpg" } | null {
  const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (!match) return null;
  return { bytes: Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0)), type: match[1] === "png" ? "png" : "jpg" };
}

// 2-5c(2): at least two words of a divided sentence on each page.
function sentenceSplitOk(lastOnPage: string, firstOnNext: string): boolean {
  const before = lastOnPage.trimEnd();
  if (!/[.?!]["')\]]?$/.test(before)) {
    const tail = before.split(/(?<=[.?!]["')\]]?)\s+/).pop() ?? "";
    if (tail.trim().split(/\s+/).filter(Boolean).length < 2) return false;
  }
  const head = firstOnNext.trimStart().match(/^(.*?[.?!]["')\]]?)(\s|$)/);
  if (head && head[1].split(/\s+/).filter(Boolean).length < 2) return false;
  return true;
}

export async function buildPdf(spec: MemoSpec): Promise<Uint8Array> {
  const validation = validateMemo(spec);
  if (!validation.canGenerate) {
    throw new Error(`Cannot generate memorandum: ${validation.blockingErrors.map(({ label }) => label).join(", ")}`);
  }

  const doc = await PDFDocument.create();
  const times = spec.font === "Times New Roman";
  const dhaStyle = spec.letterhead.letterheadStyle === "dha";
  const fonts: Fonts = {
    regular: await doc.embedFont(times ? StandardFonts.TimesRoman : StandardFonts.Helvetica),
    bold: await doc.embedFont(times ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold),
    lhBold: await doc.embedFont(dhaStyle ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold),
    lhRegular: await doc.embedFont(dhaStyle ? StandardFonts.TimesRoman : StandardFonts.HelveticaBold)
  };
  const clean = makeSanitizer(fonts.regular);
  const isRecord = spec.type === "mfr" || spec.type === "counseling";
  // Figure 2-17: a memorandum for record is typed on plain white paper (no letterhead).
  const useLetterhead = spec.type !== "mfr";

  // Text -> rows. firstIndent applies to the first line only; runIndent to every runover line.
  const text = (
    value: string,
    o: { x?: number; width?: number; firstIndent?: number; runIndent?: number; bold?: boolean; align?: Seg["align"] } = {}
  ): Row[] => {
    const x = o.x ?? MARGIN;
    const width = o.width ?? RIGHT - x;
    const first = o.firstIndent ?? 0;
    const run = o.runIndent ?? 0;
    const font = o.bold ? fonts.bold : fonts.regular;
    return wrap(clean(value), font, BODY_SIZE, width - first, width - run).map((line, i) => [
      { text: line, x: x + (i === 0 ? first : run), width: width - (i === 0 ? first : run), bold: o.bold, align: o.align }
    ]);
  };

  // ---------------- Page 1 heading (absolute positions) ----------------
  let officeTop = useLetterhead ? OFFICE_TOP_LETTERHEAD : MARGIN;
  let suspenseTop: number | null = null;
  if (spec.suspense?.trim()) {
    // Suspense: flush right, bold, two lines above the date line.
    suspenseTop = officeTop - 2 * LH;
    if (suspenseTop < MARGIN) {
      suspenseTop = MARGIN;
      officeTop = MARGIN + 2 * LH;
    }
  }
  const dateText = clean(spec.date.trim() || "[DATE]");
  const dateWidth = fonts.regular.widthOfTextAtSize(dateText, BODY_SIZE);
  const officeRows = text(fullOfficeSymbol(spec), { width: CONTENT_W - dateWidth - 24 });
  officeRows[0].push({ text: dateText, x: MARGIN, width: CONTENT_W, align: "right" });

  // ---------------- Flowing blocks ----------------
  const blocks: Block[] = [];
  const addressees = trimmedList(spec.addressees);
  const distribution = trimmedList(spec.distribution).length ? trimmedList(spec.distribution) : addressees.length > 5 ? addressees : [];
  const seeDistribution = distribution.length > 0;
  const addrList = (list: string[], gap: number) =>
    list.forEach((addr, i) => blocks.push({ rows: text(addr, { runIndent: INDENT }), gap: i === 0 ? gap : 0 }));

  if (isRecord) {
    blocks.push({ rows: text("MEMORANDUM FOR RECORD"), gap: 2 });
  } else {
    const thru = trimmedList(spec.thru);
    const forTarget = seeDistribution ? ["SEE DISTRIBUTION"] : addressees;
    if (thru.length === 1) {
      // Fig 2-11: MEMORANDUM THRU and the address on one line; runover flush left.
      blocks.push({ rows: text(`MEMORANDUM THRU ${thru[0]}`), gap: 2 });
    } else if (thru.length > 1) {
      // Fig 2-12: MEMORANDUM THRU alone, then each address; runover indented 1/4 inch.
      blocks.push({ rows: text("MEMORANDUM THRU"), gap: 2 });
      addrList(thru, 1);
    }
    const lead = thru.length ? "FOR" : "MEMORANDUM FOR";
    const leadGap = thru.length ? 1 : 2;
    if (forTarget.length <= 1) {
      // Single address: on the same line; runover flush with the left margin.
      blocks.push({ rows: text(`${lead} ${forTarget[0] ?? ""}`.trimEnd()), gap: leadGap });
    } else {
      // Multiple-address (2 to 5): each address on its own line, runover indented 1/4 inch (figs 2-5, 2-7).
      blocks.push({ rows: text(lead), gap: leadGap });
      addrList(forTarget, 1);
    }
  }
  // SUBJECT: one space after the colon (para 1-39b(9), fig 2-17).
  blocks.push({ rows: text(`SUBJECT: ${spec.subject.trim()}`), gap: 1 });

  // Body. A one-paragraph memorandum is not numbered (fig 2-13); its subparagraphs still are.
  const single = spec.paragraphs.length === 1;
  const bodyStart = blocks.length;
  const appendBody = (nodes: ParagraphNode[], depth: number) => {
    nodes.forEach((node, index) => {
      const numbered = !(single && depth === 0);
      const label = numbered ? `${paragraphLabel(depth, index + 1)}  ` : "";
      const rows = text(`${label}${node.text.trim()}`, { firstIndent: numbered ? LEVEL_INDENT[Math.min(depth, 3)] : 0 });
      blocks.push({ rows, gap: blocks.length === bodyStart ? 2 : 1, splittable: rows.length > 3 });
      appendBody(node.children, depth + 1);
    });
  };
  appendBody(spec.paragraphs, 0);
  blocks[blocks.length - 1].lastBody = true;

  // Closing: authority line (2nd line below text), signature block (5th line below the authority
  // line or text) at page center, enclosure listing at the left margin on the same line.
  const sig: Row[] = [];
  const sigText = (value: string, indent = 0) => text(value, { x: SIG_X + indent, runIndent: indent ? 0 : INDENT });
  sig.push(...sigText(spec.signature.name.trim().toUpperCase()));
  if (!spec.signature.civilian) sig.push(...sigText(spec.signature.rankBranch.trim()));
  // Title runover (a long title) continues on the next line indented 1/4 inch (para 6-4c).
  trimmedList(spec.signature.title).forEach((title, i) => sig.push(...(i === 0 ? sigText(title) : sigText(title, INDENT))));
  const enclosures = trimmedList(spec.enclosures);
  const encl: Row[] = [];
  if (enclosures.length === 1) {
    encl.push(...text("Encl", { width: ENCL_W }), ...text(enclosures[0], { width: ENCL_W }));
  } else if (enclosures.length > 1) {
    encl.push(...text(`${enclosures.length} Encls`, { width: ENCL_W }));
    enclosures.forEach((e, i) => {
      const label = `${i + 1}. `;
      const hang = fonts.regular.widthOfTextAtSize(label, BODY_SIZE);
      encl.push(...text(`${label}${e}`, { width: ENCL_W, runIndent: hang }));
    });
  }
  const closingRows: Row[] = [];
  const authority = spec.type === "mfr" ? "" : spec.authorityLine?.trim() ?? "";
  if (authority) {
    closingRows.push(...text(authority.toUpperCase()));
    for (let i = 0; i < 4; i += 1) closingRows.push([]);
  }
  for (let i = 0; i < Math.max(sig.length, encl.length); i += 1) closingRows.push([...(encl[i] ?? []), ...(sig[i] ?? [])]);
  blocks.push({ rows: closingRows, gap: authority ? 1 : 4, closing: true });

  if (distribution.length) {
    blocks.push({ rows: text("DISTRIBUTION:"), gap: 1, keepWithNext: true });
    distribution.forEach((d) => blocks.push({ rows: text(d), gap: 0 }));
  }
  const cf = trimmedList(spec.cfRecipients);
  if (cf.length) {
    blocks.push({ rows: text("CF:"), gap: 1, keepWithNext: true });
    cf.forEach((c) => blocks.push({ rows: text(c), gap: 0 }));
  }
  if (spec.type === "counseling" && spec.acknowledgment) {
    const ack: Row[] = [...text("ACKNOWLEDGMENT"), [], ...text(spec.acknowledgment.statement)];
    spec.acknowledgment.signers.forEach((s) => ack.push(...text(s.label)));
    blocks.push({ rows: ack, gap: 1 });
  }

  // ---------------- Pagination ----------------
  const contHeaderRows = [...text(fullOfficeSymbol(spec)), ...text(`SUBJECT: ${spec.subject.trim()}`)];
  const contBodyTop = MARGIN + contHeaderRows.length * LH + 2 * LH; // text on the 3rd line below the subject

  type Placed = { page: number; top: number; row: Row };
  const placed: Placed[] = [];
  let page = 0;
  let y = officeTop + officeRows.length * LH;
  let atPageTop = false;
  const newPage = () => {
    page += 1;
    y = contBodyTop;
    atPageTop = true;
  };
  const put = (rows: Row[]) => {
    rows.forEach((row) => {
      placed.push({ page, top: y, row });
      y += LH;
    });
    atPageTop = false;
  };
  const room = () => Math.floor((BODY_BOTTOM - y + 0.01) / LH);
  const gapOf = (b: Block) => (atPageTop ? 0 : b.gap);
  const pageLines = Math.floor((BODY_BOTTOM - contBodyTop + 0.01) / LH);

  // Split point for a paragraph: 2+ lines on each page and 2+ words of a divided sentence on each page.
  const splitAt = (rows: Row[], avail: number, force: boolean): number => {
    let take = Math.min(avail, rows.length - 2);
    if (force) return take;
    while (take >= 2 && !sentenceSplitOk(rows[take - 1][0]?.text ?? "", rows[take][0]?.text ?? "")) take -= 1;
    return take;
  };
  const placeSplittable = (b: Block) => {
    let rows = b.rows;
    let gap = gapOf(b);
    for (;;) {
      const avail = room() - gap;
      if (rows.length <= avail) {
        y += gap * LH;
        put(rows);
        return;
      }
      const take = splitAt(rows, avail, atPageTop);
      if (take < 2) {
        if (atPageTop) {
          put(rows); // cannot satisfy the rules on an empty page; place as is
          return;
        }
        newPage();
        gap = 0;
        continue;
      }
      y += gap * LH;
      put(rows.slice(0, take));
      rows = rows.slice(take);
      newPage();
      gap = 0;
    }
  };

  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    const next = blocks[i + 1];
    if (b.lastBody && next?.closing) {
      // 2-5c(4): the authority line and signature block never go to a continuation page without
      // at least two lines of the last paragraph (a one-line last paragraph may go alone with them).
      const closingNeed = next.gap + next.rows.length;
      if (gapOf(b) + b.rows.length + closingNeed <= room()) {
        y += gapOf(b) * LH;
        put(b.rows);
      } else if (b.rows.length <= 3) {
        // A paragraph of three lines or fewer is never divided: it moves with the closing.
        newPage();
        put(b.rows);
      } else {
        // Split so the last 2+ lines carry over with the closing.
        const take = splitAt(b.rows, room() - gapOf(b), false);
        const rest = b.rows.length - take;
        if (take >= 2 && rest + closingNeed <= pageLines) {
          y += gapOf(b) * LH;
          put(b.rows.slice(0, take));
          newPage();
          put(b.rows.slice(take));
        } else if (b.rows.length + closingNeed <= pageLines) {
          // No clean split point: move the whole paragraph to the next page with the closing.
          newPage();
          put(b.rows);
        } else {
          placeSplittable(b);
        }
      }
      i += 1; // place the closing right after
      y += gapOf(next) * LH;
      if (next.rows.length > room()) newPage();
      put(next.rows);
      continue;
    }
    if (b.splittable) {
      placeSplittable(b);
      continue;
    }
    const need = gapOf(b) + b.rows.length + (b.keepWithNext && next ? next.gap + Math.min(next.rows.length, 1) : 0);
    if (need > room()) newPage();
    y += gapOf(b) * LH;
    put(b.rows);
  }

  // ---------------- Drawing ----------------
  const pages: PDFPage[] = [];
  for (let p = 0; p <= page; p += 1) pages.push(doc.addPage([PAGE_W, PAGE_H]));
  const draw = (pg: PDFPage, seg: Seg, top: number, font: PDFFont, size = BODY_SIZE, color: RGB = BLACK) => {
    const value = clean(seg.text);
    if (!value) return;
    const w = font.widthOfTextAtSize(value, size);
    const x = seg.align === "right" ? seg.x + seg.width - w : seg.align === "center" ? seg.x + (seg.width - w) / 2 : seg.x;
    pg.drawText(value, { x, y: PAGE_H - top - BASELINE * (size / BODY_SIZE), size, font, color });
  };
  const drawRow = (pg: PDFPage, row: Row, top: number) => row.forEach((seg) => draw(pg, seg, top, seg.bold ? fonts.bold : fonts.regular));

  // Letterhead (page 1 only).
  if (useLetterhead) {
    const seal = spec.letterhead.sealImageDataUrl ? dataUrlBytes(spec.letterhead.sealImageDataUrl) : null;
    if (seal) {
      const image: PDFImage = seal.type === "png" ? await doc.embedPng(seal.bytes) : await doc.embedJpg(seal.bytes);
      pages[0].drawImage(image, { x: SEAL_X, y: PAGE_H - SEAL_TOP - SEAL_SIZE, width: SEAL_SIZE, height: SEAL_SIZE });
    }
    // Army (APD template): line 1 Arial Bold 10 pt, other lines Arial Bold 8 pt, black.
    // DHA (DHA letterhead layout): line 1 Times New Roman Bold 12 pt, other lines Times New Roman 12 pt.
    // Black ink for both (AR 25-50, paras 1-16b(3) and 1-20).
    const lines = trimmedList(spec.letterhead.orgLines);
    let baseline = dhaStyle ? 51 : 59;
    lines.forEach((line, i) => {
      const size = dhaStyle ? 12 : i === 0 ? 10 : 8;
      const font = i === 0 ? fonts.lhBold : fonts.lhRegular;
      const value = clean(line);
      const w = font.widthOfTextAtSize(value, size);
      pages[0].drawText(value, { x: (PAGE_W - w) / 2, y: PAGE_H - baseline, size, font, color: BLACK });
      baseline += dhaStyle ? 13.5 : i === 0 ? 9.1 : 9.2;
    });
  }
  if (suspenseTop !== null) {
    draw(pages[0], { text: `S: ${spec.suspense?.trim() ?? ""}`, x: MARGIN, width: CONTENT_W, align: "right" }, suspenseTop, fonts.bold);
  }
  officeRows.forEach((row, i) => drawRow(pages[0], row, officeTop + i * LH));
  placed.forEach(({ page: p, top, row }) => drawRow(pages[p], row, top));

  // Continuation pages: office symbol 1 inch from the top, subject on the next line,
  // page number centered approximately 1 inch from the bottom. Page 1 is not numbered.
  pages.forEach((pg, index) => {
    if (index === 0) return;
    contHeaderRows.forEach((row, i) => drawRow(pg, row, MARGIN + i * LH));
    draw(pg, { text: String(index + 1), x: MARGIN, width: CONTENT_W, align: "center" }, PAGE_NUMBER_TOP, fonts.regular);
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
