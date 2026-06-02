import { cloneSpec, type MemoSpec, type ParagraphNode } from "../model/memoSpec";

export type ComplianceLevel = "pass" | "warn" | "fail";
export type MemoStage = "setup" | "body" | "closing" | "review";

export type ComplianceItem = {
  code: string;
  label: string;
  level: ComplianceLevel;
  detail: string;
  stage: MemoStage;
  focusTarget?: string;
};

export type ValidationResult = {
  items: ComplianceItem[];
  blockingErrors: ComplianceItem[];
  warnings: ComplianceItem[];
  canGenerate: boolean;
};

const DATE_PATTERN =
  /^(?:\[DATE\]|(?:[1-9]|[12]\d|3[01]) (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4})$/;
const SENTENCE_SPACING_PATTERN = /[.?] (?=\S)/;
const ACRONYM_PATTERN = /\b[A-Z][A-Z0-9-]{1,}\b/g;
const EXPANDED_ACRONYM_PATTERN = /\(([A-Z][A-Z0-9-]{1,})\)/g;
const MAX_DEPTH = 5;
const COMPLIANCE_TARGETS: Record<
  string,
  { stage: MemoStage; focusTarget?: string }
> = {
  letterhead: { stage: "setup", focusTarget: "letterhead-profile" },
  arims: { stage: "setup", focusTarget: "arims-record-number" },
  subject: { stage: "setup", focusTarget: "memo-subject" },
  "subject-length": { stage: "setup", focusTarget: "memo-subject" },
  addressee: { stage: "setup", focusTarget: "addressee-list" },
  signature: { stage: "closing", focusTarget: "signature-name" },
  "lone-child": { stage: "body", focusTarget: "body-blocks" },
  nesting: { stage: "body", focusTarget: "body-blocks" },
  "right-margin": { stage: "body", focusTarget: "body-blocks" },
  "paragraph-length": { stage: "body", focusTarget: "body-blocks" },
  "sentence-spacing": { stage: "body", focusTarget: "sentence-spacing-tool" },
  acronym: { stage: "body", focusTarget: "body-blocks" },
  "date-format": { stage: "setup", focusTarget: "memo-date" },
  "date-placeholder": { stage: "setup", focusTarget: "memo-date" },
  bluf: { stage: "body", focusTarget: "body-blocks" }
};

function trimmed(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function walkParagraphs(
  paragraphs: ParagraphNode[],
  visit: (paragraph: ParagraphNode, depth: number) => void,
  depth = 0
): void {
  paragraphs.forEach((paragraph) => {
    visit(paragraph, depth);
    walkParagraphs(paragraph.children, visit, depth + 1);
  });
}

function paragraphText(spec: MemoSpec): string {
  const body: string[] = [];
  walkParagraphs(spec.paragraphs, (paragraph) => body.push(paragraph.text));
  return body.join("\n");
}

function estimateLineCount(text: string): number {
  return text
    .split("\n")
    .reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / 95)), 0);
}

function hasUnexpandedAcronym(text: string): boolean {
  const expanded = new Set(
    [...text.matchAll(EXPANDED_ACRONYM_PATTERN)].map((match) => match[1])
  );
  return [...text.matchAll(ACRONYM_PATTERN)].some(
    (match) => !expanded.has(match[0])
  );
}

function item(
  code: string,
  label: string,
  level: ComplianceLevel,
  detail: string
): ComplianceItem {
  return {
    code,
    label,
    level,
    detail,
    ...(COMPLIANCE_TARGETS[code] ?? { stage: "review" as const })
  };
}

export function validateMemo(spec: MemoSpec): ValidationResult {
  const items: ComplianceItem[] = [];
  const bodyText = paragraphText(spec);
  const addressees = trimmed(spec.addressees);
  let hasLoneChild = false;
  let hasDeepNesting = false;
  let hasLongParagraph = false;

  walkParagraphs(spec.paragraphs, (paragraph, depth) => {
    if (paragraph.children.length === 1) hasLoneChild = true;
    if (depth > MAX_DEPTH) hasDeepNesting = true;
    if (estimateLineCount(paragraph.text) > 10) hasLongParagraph = true;
  });

  items.push(
    spec.letterhead.orgLines.some((line) => line.trim())
      ? item("letterhead", "Letterhead profile", "pass", "A letterhead profile is selected.")
      : item("letterhead", "Letterhead profile", "fail", "Select or import a profile.")
  );
  items.push(
    spec.arimsRecordNumber.trim()
      ? item("arims", "ARIMS record number", "pass", "The record number will follow the office symbol.")
      : item(
          "arims",
          "ARIMS record number not entered",
          "warn",
          "ArmyMemo allows export without it. Confirm the applicable ARIMS/RRS-A record number when available."
        )
  );
  items.push(
    spec.subject.trim()
      ? item("subject", "Subject", "pass", "A subject is present.")
      : item("subject", "Subject required", "fail", "Enter one subject for the memorandum.")
  );
  if (spec.subject.trim().split(/\s+/).filter(Boolean).length > 10) {
    items.push(
      item(
        "subject-length",
        "Subject over 10 words",
        "warn",
        "AR 25-50 recommends a subject of 10 words or fewer."
      )
    );
  }
  items.push(
    spec.type !== "memo" || addressees.length > 0 || trimmed(spec.distribution).length > 0
      ? item("addressee", "Addressee", "pass", "The memorandum routing is defined.")
      : item("addressee", "Addressee required", "fail", "Standard memorandums need an addressee or distribution list.")
  );
  items.push(
    spec.signature.name.trim() &&
      (spec.signature.civilian || spec.signature.rankBranch.trim()) &&
      trimmed(spec.signature.title).length
      ? item("signature", "Signature block", "pass", "Required signature lines are present.")
      : item("signature", "Signature block incomplete", "fail", "Enter the signer name, title, and military rank and branch when applicable.")
  );
  items.push(
    hasLoneChild
      ? item("lone-child", "Lone subparagraph", "fail", "Each subdivision needs at least two sibling paragraphs.")
      : item("lone-child", "Paragraph subdivisions", "pass", "No lone subparagraphs detected.")
  );
  if (hasDeepNesting) {
    items.push(
      item("nesting", "Paragraph nesting too deep", "fail", "Use no more than six numbering levels.")
    );
  }
  items.push(
    item("right-margin", "Ragged right margin", "pass", "The generator never justifies memo text.")
  );
  if (hasLongParagraph) {
    items.push(
      item("paragraph-length", "Paragraph over 10 lines", "warn", "Shorten the flagged paragraph or move detail to an enclosure.")
    );
  }
  if (SENTENCE_SPACING_PATTERN.test(bodyText)) {
    items.push(
      item("sentence-spacing", "Sentence spacing", "warn", "Use two spaces after sentence-ending periods and question marks.")
    );
  }
  if (hasUnexpandedAcronym(bodyText)) {
    items.push(
      item("acronym", "Acronym first use", "warn", "Confirm that each acronym is expanded on first use.")
    );
  }
  if (!DATE_PATTERN.test(spec.date.trim())) {
    items.push(
      item("date-format", "Date format", "warn", "Use the format 1 June 2026 or keep [DATE] until signing.")
    );
  } else if (spec.date.trim() === "[DATE]") {
    items.push(
      item("date-placeholder", "Date pending signature", "warn", "Complete the official date during the signing workflow.")
    );
  }
  if (spec.paragraphs[0]?.text.length > 450) {
    items.push(
      item("bluf", "BLUF reminder", "warn", "Keep the purpose and main point easy to find near the beginning.")
    );
  }

  const blockingErrors = items.filter(({ level }) => level === "fail");
  const warnings = items.filter(({ level }) => level === "warn");
  return {
    items,
    blockingErrors,
    warnings,
    canGenerate: blockingErrors.length === 0
  };
}

export function fixSentenceSpacing(spec: MemoSpec): MemoSpec {
  const fixed = cloneSpec(spec);
  const replaceSpacing = (text: string) =>
    text.replace(/([.?]) (?=\S)/g, "$1  ");
  const fixParagraphs = (paragraphs: ParagraphNode[]) => {
    paragraphs.forEach((paragraph) => {
      paragraph.text = replaceSpacing(paragraph.text);
      fixParagraphs(paragraph.children);
    });
  };
  fixParagraphs(fixed.paragraphs);
  fixed.acknowledgment = fixed.acknowledgment
    ? {
        ...fixed.acknowledgment,
        statement: replaceSpacing(fixed.acknowledgment.statement)
      }
    : null;
  return fixed;
}
