// Word generator built to AR 25-50 (10 Oct 2020, administrative revision 4 Oct 2024):
// chapter 2 and figures 2-1 through 2-17, chapter 4 (enclosures), and paragraph 6-4 (signature block).
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Tab,
  TabStopType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextWrappingType,
  TextRun,
  VerticalPositionRelativeFrom,
  WidthType,
  type FileChild,
  type IParagraphOptions,
  type ParagraphChild
} from "docx";
import type { MemoSpec, ParagraphNode } from "../model/memoSpec";
import { validateMemo } from "../validation/validate";
import { CONTENT_WIDTH, INDENT_STEP, MARGIN, PAGE_HEIGHT, PAGE_WIDTH, SIGNATURE_LEFT, SINGLE_LINE, paragraphLabel } from "./format";

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
};
const noCellMargins = { top: 0, bottom: 0, left: 0, right: 0 };

const EMUS_PER_INCH = 914400;
const SEAL_OFFSET = Math.round(EMUS_PER_INCH * 0.5); // seal 1/2 inch from the top and left edges
const SEAL_SIZE = 96; // 1 inch at 96 px per inch
const BLANK_LINE_AFTER = 276; // one blank 12-point line (13.8 pt) between paragraphs
const HEADER_DISTANCE = 720; // headers start 1/2 inch from the top edge
const FOOTER_DISTANCE = 1152; // page number centered about 1 inch from the bottom
const FIRST_PAGE_TOP = 2160; // page-1 text area starts 1.5 in down (just below the seal)
// First-line indents by level: 1. at the margin, a. 1/4 in, (1) 1/2 in, (a) 1/2 in (fig 2-1).
const LEVEL_INDENT = [0, INDENT_STEP, 2 * INDENT_STEP, 2 * INDENT_STEP];

function run(spec: MemoSpec, text: string, options: { bold?: boolean } = {}): TextRun {
  return new TextRun({ text, font: spec.font, size: spec.fontSizePt * 2, bold: options.bold });
}

function memoParagraph(children: ParagraphChild[] = [], options: Omit<IParagraphOptions, "children"> = {}): Paragraph {
  return new Paragraph({ children, spacing: { line: SINGLE_LINE }, widowControl: true, ...options });
}

function emptyParagraphs(count: number, keepNext = false): Paragraph[] {
  return Array.from({ length: count }, () => memoParagraph([], { keepNext }));
}

const trimmedList = (values: string[]) => values.map((value) => value.trim()).filter(Boolean);

function fullOfficeSymbol(spec: MemoSpec): string {
  const arims = spec.arimsRecordNumber.trim();
  return arims ? `${spec.officeSymbol.trim()} (${arims})` : spec.officeSymbol.trim();
}

function dataUrlToImage(dataUrl: string): { data: Uint8Array; type: "png" | "jpg" } | null {
  const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  return { data: bytes, type: match[1] === "png" ? "png" : "jpg" };
}

function createLetterheadSeal(image: { data: Uint8Array; type: "png" | "jpg" }): ImageRun {
  return new ImageRun({
    type: image.type,
    data: image.data,
    transformation: { width: SEAL_SIZE, height: SEAL_SIZE },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: SEAL_OFFSET },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: SEAL_OFFSET },
      allowOverlap: true,
      behindDocument: false,
      wrap: { type: TextWrappingType.NONE }
    },
    altText: {
      title: "Authorized letterhead seal",
      description: "Authorized organization letterhead seal",
      name: "Authorized letterhead seal"
    }
  });
}

// Army style (APD template): line 1 Arial Bold 10 pt, other lines Arial Bold 8 pt.
// DHA style (DHA letterhead layout): line 1 Times New Roman Bold 12 pt, other lines Times New Roman 12 pt.
// Black ink for both (AR 25-50, paras 1-16b(3) and 1-20).
function createLetterhead(spec: MemoSpec): Paragraph[] {
  const image = spec.letterhead.sealImageDataUrl ? dataUrlToImage(spec.letterhead.sealImageDataUrl) : null;
  const seal = image ? createLetterheadSeal(image) : null;
  const dha = spec.letterhead.letterheadStyle === "dha";
  return trimmedList(spec.letterhead.orgLines).map((line, index) =>
    memoParagraph(
      [
        ...(index === 0 && seal ? [seal] : []),
        new TextRun({
          text: line,
          font: dha ? "Times New Roman" : "Arial",
          size: dha ? 24 : index === 0 ? 20 : 16,
          bold: dha ? index === 0 : true
        })
      ],
      { alignment: AlignmentType.CENTER, spacing: { line: SINGLE_LINE, before: index === 0 ? (dha ? 80 : 280) : 0 } }
    )
  );
}

// Continuation pages: office symbol 1 inch from the top, subject on the next line,
// text resumes on the third line below the subject (para 2-5).
function createContinuationHeader(spec: MemoSpec): Header {
  return new Header({
    children: [
      memoParagraph([run(spec, fullOfficeSymbol(spec))], { spacing: { line: SINGLE_LINE, before: 720 } }),
      memoParagraph([run(spec, `SUBJECT: ${spec.subject.trim()}`)]),
      ...emptyParagraphs(2)
    ]
  });
}

function createContinuationFooter(spec: MemoSpec): Footer {
  return new Footer({
    children: [
      memoParagraph([new TextRun({ children: [PageNumber.CURRENT], font: spec.font, size: spec.fontSizePt * 2 })], {
        alignment: AlignmentType.CENTER
      })
    ]
  });
}

// Address line: first line at the margin; runover indented 1/4 inch when `hang` (multiple-address lists).
function addressParagraph(spec: MemoSpec, text: string, hang: boolean): Paragraph {
  return memoParagraph([run(spec, text)], hang ? { indent: { left: INDENT_STEP, hanging: INDENT_STEP } } : {});
}

function createHeading(spec: MemoSpec): FileChild[] {
  const children: FileChild[] = [];
  const mfr = spec.type === "mfr";
  // Suspense: bold, flush right, two lines above the date line. Office symbol: second line below the seal.
  if (spec.suspense?.trim()) {
    children.push(
      memoParagraph([run(spec, `S: ${spec.suspense.trim()}`, { bold: true })], { alignment: AlignmentType.RIGHT }),
      ...emptyParagraphs(1)
    );
  } else if (!mfr) {
    children.push(...emptyParagraphs(2));
  }
  children.push(
    memoParagraph([run(spec, fullOfficeSymbol(spec)), new TextRun({ children: [new Tab()], font: spec.font, size: spec.fontSizePt * 2 }), run(spec, spec.date.trim() || "[DATE]")], {
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }]
    }),
    ...emptyParagraphs(2)
  );

  if (spec.type === "mfr" || spec.type === "counseling") {
    children.push(memoParagraph([run(spec, "MEMORANDUM FOR RECORD")]));
  } else {
    const thru = trimmedList(spec.thru);
    const addressees = trimmedList(spec.addressees);
    const useDistribution = trimmedList(spec.distribution).length > 0 || addressees.length > 5;
    const forTarget = useDistribution ? ["SEE DISTRIBUTION"] : addressees;
    if (thru.length === 1) {
      children.push(addressParagraph(spec, `MEMORANDUM THRU ${thru[0]}`, false), ...emptyParagraphs(1));
    } else if (thru.length > 1) {
      children.push(memoParagraph([run(spec, "MEMORANDUM THRU")]), ...emptyParagraphs(1));
      thru.forEach((recipient) => children.push(addressParagraph(spec, recipient, true)));
      children.push(...emptyParagraphs(1));
    }
    const lead = thru.length ? "FOR" : "MEMORANDUM FOR";
    if (forTarget.length <= 1) {
      children.push(addressParagraph(spec, `${lead} ${forTarget[0] ?? ""}`.trimEnd(), false));
    } else {
      children.push(memoParagraph([run(spec, lead)]), ...emptyParagraphs(1));
      forTarget.forEach((recipient) => children.push(addressParagraph(spec, recipient, true)));
    }
  }

  // SUBJECT: one space after the colon (para 1-39b(9); fig 2-17).
  children.push(...emptyParagraphs(1), memoParagraph([run(spec, `SUBJECT: ${spec.subject.trim()}`)]), ...emptyParagraphs(2));
  return children;
}

function countParagraphs(nodes: ParagraphNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countParagraphs(node.children), 0);
}

function createBodyParagraphs(spec: MemoSpec): Paragraph[] {
  const children: Paragraph[] = [];
  const single = spec.paragraphs.length === 1;
  const total = countParagraphs(spec.paragraphs);
  const append = (nodes: ParagraphNode[], depth = 0) => {
    nodes.forEach((node, index) => {
      // A one-paragraph memorandum is not numbered; its subparagraphs are (fig 2-13).
      const numbered = !(single && depth === 0);
      const label = numbered ? `${paragraphLabel(depth, index + 1)}  ` : "";
      const firstLine = numbered ? LEVEL_INDENT[Math.min(depth, 3)] : 0;
      children.push(
        memoParagraph([run(spec, `${label}${node.text.trim()}`)], {
          indent: firstLine ? { left: 0, firstLine } : { left: 0 },
          spacing: { line: SINGLE_LINE, after: BLANK_LINE_AFTER },
          // The last paragraph stays with the closing so the signature block never stands alone
          // (para 2-5c(4)); widow control keeps at least two of its lines together.
          keepNext: children.length === total - 1
        })
      );
      append(node.children, depth + 1);
    });
  };
  append(spec.paragraphs);
  return children;
}

function createSignatureParagraphs(spec: MemoSpec, left = SIGNATURE_LEFT): Paragraph[] {
  // Name in capitals, rank and branch (omitted for civilians), title; title runover indented 1/4 inch.
  const titleIndent = { left: left + INDENT_STEP, hanging: INDENT_STEP };
  return [
    memoParagraph([run(spec, spec.signature.name.trim().toUpperCase())], { indent: { left }, keepNext: true }),
    ...(spec.signature.civilian
      ? []
      : [memoParagraph([run(spec, spec.signature.rankBranch.trim())], { indent: { left }, keepNext: true })]),
    ...trimmedList(spec.signature.title).map((title, index, all) =>
      memoParagraph([run(spec, title)], {
        indent: index === 0 ? titleIndent : { left: left + INDENT_STEP },
        keepNext: index < all.length - 1
      })
    )
  ];
}

function createClosing(spec: MemoSpec): FileChild[] {
  const enclosures = trimmedList(spec.enclosures);
  if (enclosures.length === 0) return createSignatureParagraphs(spec);
  // Enclosure listing at the left margin on the same line as the signature block (chap 4).
  const enclTab = [{ type: TabStopType.LEFT, position: INDENT_STEP }];
  const leftLines =
    enclosures.length === 1
      ? [memoParagraph([run(spec, "Encl")]), memoParagraph([run(spec, enclosures[0])])]
      : [
          memoParagraph([run(spec, `${enclosures.length} Encls`)]),
          ...enclosures.map((enclosure, index) =>
            memoParagraph([run(spec, `${index + 1}.\t${enclosure}`)], {
              tabStops: enclTab,
              indent: { left: INDENT_STEP, hanging: INDENT_STEP }
            })
          )
        ];
  const columnWidth = SIGNATURE_LEFT;
  return [
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [columnWidth, CONTENT_WIDTH - columnWidth],
      borders: noBorders,
      margins: noCellMargins,
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({ width: { size: columnWidth, type: WidthType.DXA }, borders: noBorders, margins: noCellMargins, children: leftLines }),
            new TableCell({
              width: { size: CONTENT_WIDTH - columnWidth, type: WidthType.DXA },
              borders: noBorders,
              margins: noCellMargins,
              children: createSignatureParagraphs(spec, 0)
            })
          ]
        })
      ]
    })
  ];
}

function createPostClosing(spec: MemoSpec): FileChild[] {
  const children: FileChild[] = [];
  const cfRecipients = trimmedList(spec.cfRecipients);
  const addressees = trimmedList(spec.addressees);
  const distribution = trimmedList(spec.distribution).length ? trimmedList(spec.distribution) : addressees.length > 5 ? addressees : [];
  if (distribution.length) {
    children.push(
      ...emptyParagraphs(1),
      memoParagraph([run(spec, "DISTRIBUTION:")], { keepNext: true }),
      ...distribution.map((recipient) => memoParagraph([run(spec, recipient)]))
    );
  }
  if (cfRecipients.length) {
    children.push(
      ...emptyParagraphs(1),
      memoParagraph([run(spec, "CF:")], { keepNext: true }),
      ...cfRecipients.map((recipient) => memoParagraph([run(spec, recipient)]))
    );
  }
  if (spec.type === "counseling" && spec.acknowledgment) {
    const lines = ["ACKNOWLEDGMENT", spec.acknowledgment.statement, ...spec.acknowledgment.signers.map((signer) => signer.label)];
    children.push(
      ...emptyParagraphs(1),
      ...lines.map((line, index) =>
        memoParagraph([run(spec, line)], {
          keepNext: index < lines.length - 1,
          keepLines: true,
          spacing: { line: SINGLE_LINE, after: index === 0 ? BLANK_LINE_AFTER : 0 }
        })
      )
    );
  }
  return children;
}

export async function buildDocx(spec: MemoSpec): Promise<Blob> {
  const validation = validateMemo(spec);
  if (!validation.canGenerate) {
    throw new Error(`Cannot generate memorandum: ${validation.blockingErrors.map(({ label }) => label).join(", ")}`);
  }
  const mfr = spec.type === "mfr";

  const children: FileChild[] = [...createHeading(spec), ...createBodyParagraphs(spec)];
  // Authority line on the 2nd line below the text; signature block on the 5th line below the
  // authority line or the text. The last paragraph's spacing supplies the first blank line.
  const authority = mfr ? "" : spec.authorityLine?.trim() ?? "";
  if (authority) {
    children.push(memoParagraph([run(spec, authority.toUpperCase())], { keepNext: true }), ...emptyParagraphs(4, true));
  } else {
    children.push(...emptyParagraphs(3, true));
  }
  children.push(...createClosing(spec), ...createPostClosing(spec));

  const document = new Document({
    creator: "ArmyMemo",
    title: spec.subject.trim(),
    description: "Unsigned Army memorandum prepared locally in ArmyMemo.",
    styles: {
      default: {
        document: {
          run: { font: spec.font, size: spec.fontSizePt * 2 },
          paragraph: { spacing: { line: SINGLE_LINE } }
        }
      }
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: {
              // MFRs go on plain paper: office symbol 1 inch from the top (fig 2-17).
              top: mfr ? MARGIN : FIRST_PAGE_TOP,
              right: MARGIN,
              bottom: MARGIN,
              left: MARGIN,
              header: HEADER_DISTANCE,
              footer: FOOTER_DISTANCE
            }
          }
        },
        headers: {
          first: new Header({ children: mfr ? emptyParagraphs(1) : createLetterhead(spec) }),
          default: createContinuationHeader(spec)
        },
        footers: {
          first: new Footer({ children: emptyParagraphs(1) }),
          default: createContinuationFooter(spec)
        },
        children
      }
    ]
  });

  return Packer.toBlob(document);
}

