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
import {
  CONTENT_WIDTH,
  HEADER_FOOTER_MARGIN,
  INDENT_STEP,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  PARAGRAPH_AFTER,
  SIGNATURE_LEFT,
  SINGLE_LINE,
  paragraphLabel
} from "./format";

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
};

const EMUS_PER_INCH = 914400;
const LETTERHEAD_FONT_SIZE_PT = 10;
const LETTERHEAD_SEAL_OFFSET = Math.round(EMUS_PER_INCH * 0.5);
const LETTERHEAD_SEAL_SIZE = 96;
const FIRST_PAGE_BODY_SPACER_PARAGRAPHS = 3;

function run(
  spec: MemoSpec,
  text: string,
  options: { bold?: boolean; italics?: boolean } = {}
): TextRun {
  return new TextRun({
    text,
    font: spec.font,
    size: spec.fontSizePt * 2,
    bold: options.bold,
    italics: options.italics
  });
}

function memoParagraph(
  children: ParagraphChild[] = [],
  options: Omit<IParagraphOptions, "children"> = {}
): Paragraph {
  return new Paragraph({
    children,
    spacing: { line: SINGLE_LINE },
    widowControl: true,
    ...options
  });
}

function emptyParagraph(): Paragraph {
  return memoParagraph([]);
}

function emptyParagraphs(count: number): Paragraph[] {
  return Array.from({ length: count }, () => emptyParagraph());
}

function fullOfficeSymbol(spec: MemoSpec): string {
  const arims = spec.arimsRecordNumber.trim();
  return arims ? `${spec.officeSymbol.trim()} (${arims})` : spec.officeSymbol.trim();
}

function dataUrlToImage(dataUrl: string): {
  data: Uint8Array;
  type: "png" | "jpg";
} | null {
  const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2]), (character) =>
    character.charCodeAt(0)
  );
  return { data: bytes, type: match[1] === "png" ? "png" : "jpg" };
}

function createLetterhead(spec: MemoSpec): Paragraph[] {
  const image = spec.letterhead.sealImageDataUrl
    ? dataUrlToImage(spec.letterhead.sealImageDataUrl)
    : null;
  const seal = image
    ? new ImageRun({
        type: image.type,
        data: image.data,
        transformation: { width: LETTERHEAD_SEAL_SIZE, height: LETTERHEAD_SEAL_SIZE },
        floating: {
          horizontalPosition: {
            relative: HorizontalPositionRelativeFrom.PAGE,
            offset: LETTERHEAD_SEAL_OFFSET
          },
          verticalPosition: {
            relative: VerticalPositionRelativeFrom.PAGE,
            offset: LETTERHEAD_SEAL_OFFSET
          },
          wrap: { type: TextWrappingType.NONE }
        },
        altText: {
          title: "Authorized letterhead seal",
          description: "Authorized organization letterhead seal",
          name: "Authorized letterhead seal"
        }
      })
    : null;

  return spec.letterhead.orgLines.map((line, index) =>
    memoParagraph(
      [
        ...(index === 0 && seal ? [seal] : []),
        new TextRun({
          text: line,
          font: spec.font,
          size: LETTERHEAD_FONT_SIZE_PT * 2,
          bold: true
        })
      ],
      {
        alignment: AlignmentType.CENTER,
        spacing: { line: SINGLE_LINE }
      }
    )
  );
}

function createFirstPageHeader(spec: MemoSpec): Header {
  return new Header({ children: createLetterhead(spec) });
}

function createContinuationHeader(spec: MemoSpec): Header {
  return new Header({
    children: [
      memoParagraph([run(spec, fullOfficeSymbol(spec))]),
      memoParagraph([run(spec, `SUBJECT:  ${spec.subject.trim()}`)])
    ]
  });
}

function createContinuationFooter(spec: MemoSpec): Footer {
  return new Footer({
    children: [
      memoParagraph(
        [new TextRun({ children: [PageNumber.CURRENT], font: spec.font, size: 24 })],
        { alignment: AlignmentType.CENTER }
      )
    ]
  });
}

function createOfficeAndDate(spec: MemoSpec): Table {
  const columnWidth = CONTENT_WIDTH / 2;
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [columnWidth, columnWidth],
    borders: noBorders,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: columnWidth, type: WidthType.DXA },
            borders: noBorders,
            children: [memoParagraph([run(spec, fullOfficeSymbol(spec))])]
          }),
          new TableCell({
            width: { size: columnWidth, type: WidthType.DXA },
            borders: noBorders,
            children: [
              memoParagraph([run(spec, spec.date.trim() || "[DATE]")], {
                alignment: AlignmentType.RIGHT
              })
            ]
          })
        ]
      })
    ]
  });
}

function createHeading(spec: MemoSpec): FileChild[] {
  const children: FileChild[] = emptyParagraphs(FIRST_PAGE_BODY_SPACER_PARAGRAPHS);
  if (spec.suspense?.trim()) {
    children.push(
      memoParagraph(
        [run(spec, `S: ${spec.suspense.trim()}`, { bold: true })],
        {
          alignment: AlignmentType.RIGHT
        }
      ),
      emptyParagraph()
    );
  }
  children.push(createOfficeAndDate(spec), ...emptyParagraphs(2));

  const thru = spec.thru.map((recipient) => recipient.trim()).filter(Boolean);
  if (thru.length) {
    thru.forEach((recipient, index) => {
      children.push(
        memoParagraph([
          run(spec, index === 0 ? `MEMORANDUM THRU ${recipient}` : `THRU ${recipient}`)
        ])
      );
    });
  }

  if (spec.type === "mfr" || spec.type === "counseling") {
    children.push(memoParagraph([run(spec, "MEMORANDUM FOR RECORD")]));
  } else {
    const addressees = spec.addressees.map((recipient) => recipient.trim()).filter(Boolean);
    const useDistribution = spec.distribution.some((recipient) => recipient.trim()) || addressees.length > 5;
    children.push(
      memoParagraph([
        run(
          spec,
          useDistribution
            ? "MEMORANDUM FOR SEE DISTRIBUTION"
            : `MEMORANDUM FOR ${addressees[0] ?? ""}`
        )
      ])
    );
    if (!useDistribution) {
      addressees.slice(1).forEach((recipient) => {
        children.push(
          memoParagraph([run(spec, recipient)], {
            indent: { firstLine: INDENT_STEP }
          })
        );
      });
    }
  }

  children.push(
    ...emptyParagraphs(1),
    memoParagraph([run(spec, `SUBJECT:  ${spec.subject.trim()}`)]),
    ...emptyParagraphs(2)
  );
  return children;
}

function createBodyParagraphs(spec: MemoSpec): Paragraph[] {
  const children: Paragraph[] = [];

  const append = (nodes: ParagraphNode[], depth = 0) => {
    nodes.forEach((node, index) => {
      const label = `${paragraphLabel(depth, index + 1)}  `;
      children.push(
        memoParagraph([run(spec, `${label}${node.text.trim()}`)], {
          indent: depth === 0 ? { left: 0 } : { left: 0, firstLine: depth * INDENT_STEP },
          keepLines: true,
          spacing: { line: SINGLE_LINE, after: PARAGRAPH_AFTER }
        })
      );
      append(node.children, depth + 1);
    });
  };
  append(spec.paragraphs);
  return children;
}

function createSignatureParagraphs(spec: MemoSpec, left = SIGNATURE_LEFT): Paragraph[] {
  return [
    memoParagraph([run(spec, spec.signature.name.trim().toUpperCase())], {
      indent: { left },
      keepNext: true
    }),
    ...(spec.signature.civilian
      ? []
      : [
          memoParagraph([run(spec, spec.signature.rankBranch.trim())], {
            indent: { left },
            keepNext: true
          })
        ]),
    ...spec.signature.title.map((title, index) =>
      memoParagraph([run(spec, title.trim())], {
        indent: { left: left + (index === 0 ? 0 : INDENT_STEP) },
        keepNext: index < spec.signature.title.length - 1
      })
    )
  ];
}

function createClosing(spec: MemoSpec): FileChild[] {
  const enclosures = spec.enclosures.map((enclosure) => enclosure.trim()).filter(Boolean);
  if (enclosures.length === 0) {
    return createSignatureParagraphs(spec);
  }
  const leftLines =
    enclosures.length === 1
      ? [memoParagraph([run(spec, "Encl")]), memoParagraph([run(spec, enclosures[0])])]
      : [
          memoParagraph([run(spec, "Encls")]),
          ...enclosures.map((enclosure, index) =>
            memoParagraph([run(spec, `${index + 1}. ${enclosure}`)])
          )
        ];
  const signatureLines = createSignatureParagraphs(spec, 0);

  return [
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [SIGNATURE_LEFT, SIGNATURE_LEFT],
      borders: noBorders,
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: SIGNATURE_LEFT, type: WidthType.DXA },
              borders: noBorders,
              children: leftLines
            }),
            new TableCell({
              width: { size: SIGNATURE_LEFT, type: WidthType.DXA },
              borders: noBorders,
              children: signatureLines
            })
          ]
        })
      ]
    })
  ];
}

function createPostClosing(spec: MemoSpec): FileChild[] {
  const children: FileChild[] = [];
  const cfRecipients = spec.cfRecipients.map((recipient) => recipient.trim()).filter(Boolean);
  const distribution =
    spec.distribution.map((recipient) => recipient.trim()).filter(Boolean).length > 0
      ? spec.distribution.map((recipient) => recipient.trim()).filter(Boolean)
      : spec.addressees.length > 5
        ? spec.addressees.map((recipient) => recipient.trim()).filter(Boolean)
        : [];

  if (distribution.length) {
    children.push(
      emptyParagraph(),
      memoParagraph([run(spec, "DISTRIBUTION:")]),
      ...distribution.map((recipient) => memoParagraph([run(spec, recipient)]))
    );
  }
  if (cfRecipients.length) {
    children.push(
      emptyParagraph(),
      memoParagraph([run(spec, "CF:")]),
      ...cfRecipients.map((recipient) => memoParagraph([run(spec, recipient)]))
    );
  }
  if (spec.type === "counseling" && spec.acknowledgment) {
    const acknowledgmentLines = [
      "ACKNOWLEDGMENT",
      spec.acknowledgment.statement,
      ...spec.acknowledgment.signers.map((signer) => signer.label)
    ];
    children.push(
      emptyParagraph(),
      ...acknowledgmentLines.map((line, index) =>
        memoParagraph([run(spec, line)], {
          keepNext: index < acknowledgmentLines.length - 1,
          keepLines: true,
          spacing: { line: SINGLE_LINE, after: index === 0 ? PARAGRAPH_AFTER : 0 }
        })
      )
    );
  }
  return children;
}

export async function buildDocx(spec: MemoSpec): Promise<Blob> {
  const validation = validateMemo(spec);
  if (!validation.canGenerate) {
    throw new Error(
      `Cannot generate memorandum: ${validation.blockingErrors
        .map(({ label }) => label)
        .join(", ")}`
    );
  }

  const children: FileChild[] = [
    ...createHeading(spec),
    ...createBodyParagraphs(spec),
    ...emptyParagraphs(spec.authorityLine?.trim() ? 1 : 4)
  ];
  if (spec.authorityLine?.trim()) {
    children.push(
      memoParagraph([run(spec, spec.authorityLine.trim().toUpperCase())]),
      ...emptyParagraphs(4)
    );
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
              top: MARGIN,
              right: MARGIN,
              bottom: MARGIN,
              left: MARGIN,
              header: HEADER_FOOTER_MARGIN,
              footer: HEADER_FOOTER_MARGIN
            }
          }
        },
        headers: {
          first: createFirstPageHeader(spec),
          default: createContinuationHeader(spec)
        },
        footers: {
          first: new Footer({ children: [emptyParagraph()] }),
          default: createContinuationFooter(spec)
        },
        children
      }
    ]
  });

  return Packer.toBlob(document);
}
