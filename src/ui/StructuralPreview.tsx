import { useEffect, useRef, useState, type RefObject } from "react";
import { paragraphLabel } from "../generator/format";
import type { MemoSpec } from "../model/memoSpec";
import type { ParagraphNode } from "../model/memoSpec";

type StructuralPreviewProps = {
  spec: MemoSpec;
};

function displayLines(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function flattenPreviewParagraphs(
  paragraphs: ParagraphNode[],
  depth = 0,
  single = paragraphs.length === 1
): Array<{ depth: number; label: string; text: string }> {
  return paragraphs.flatMap((paragraph, index) => [
    {
      depth,
      // A one-paragraph memorandum is not numbered (AR 25-50 fig 2-13).
      label: single && depth === 0 ? "" : paragraphLabel(depth, index + 1),
      text: paragraph.text
    },
    ...flattenPreviewParagraphs(paragraph.children, depth + 1, false)
  ]);
}

function PaperPreview({
  expanded = false,
  spec
}: StructuralPreviewProps & {
  expanded?: boolean;
}) {
  const sealSource =
    spec.letterhead.sealImageDataUrl ??
    (spec.letterhead.sealAssetPath
      ? `${import.meta.env.BASE_URL}${spec.letterhead.sealAssetPath}`
      : null);
  const useDistribution =
    displayLines(spec.distribution).length > 0 ||
    displayLines(spec.addressees).length > 5;
  const addressees = displayLines(spec.addressees);
  const thru = spec.type === "memo" ? displayLines(spec.thru) : [];
  const forTarget = useDistribution ? ["SEE DISTRIBUTION"] : addressees;
  const lead = thru.length ? "FOR" : "MEMORANDUM FOR";
  const addressLines =
    spec.type !== "memo"
      ? ["MEMORANDUM FOR RECORD"]
      : [
          ...(thru.length === 1 ? [`MEMORANDUM THRU ${thru[0]}`] : thru.length > 1 ? ["MEMORANDUM THRU", ...thru] : []),
          ...(forTarget.length <= 1 ? [`${lead} ${forTarget[0] ?? ""}`.trimEnd()] : [lead, ...forTarget])
        ];
  // A memorandum for record is typed on plain paper (AR 25-50 fig 2-17).
  const showLetterhead = spec.type !== "mfr";
  const previewParagraphs = flattenPreviewParagraphs(spec.paragraphs).slice(
    0,
    expanded ? 8 : 4
  );

  return (
    <div
      aria-label={expanded ? "Expanded memorandum preview" : "Approximate memorandum structure"}
      className={`paper-preview ${expanded ? "expanded" : ""}`}
    >
      {showLetterhead && <div className="preview-letterhead-row">
        <span className="preview-seal-slot">
          {sealSource && <img alt="Authorized letterhead seal" src={sealSource} />}
        </span>
        <div className="preview-letterhead">
          {spec.letterhead.orgLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
        <span aria-hidden="true" className="preview-letterhead-balance" />
      </div>}
      <div className="preview-meta">
        <span>
          {spec.officeSymbol || "[OFFICE SYMBOL]"}{" "}
          {spec.arimsRecordNumber ? `(${spec.arimsRecordNumber})` : "([ARIMS])"}
        </span>
        <span>{spec.date || "[DATE]"}</span>
      </div>
      <div className="preview-address">
        {addressLines.map((line, index) => (
          <p key={`${line}-${index}`}>{line}</p>
        ))}
      </div>
      <p className="preview-subject">SUBJECT: {spec.subject || "[SUBJECT]"}</p>
      <div className="preview-body">
        {previewParagraphs.map((paragraph, index) => (
          <p
            key={`${paragraph.depth}-${paragraph.text}-${index}`}
            style={{ marginLeft: `${Math.min(paragraph.depth, 2) * (expanded ? 16 : 6)}px` }}
          >
            {paragraph.label ? `${paragraph.label} ` : ""}{paragraph.text || "[Paragraph text]"}
          </p>
        ))}
      </div>
      {spec.authorityLine && <p className="preview-authority">{spec.authorityLine}</p>}
      <div className="preview-signature">
        <span>{spec.signature.name.toUpperCase() || "[SIGNER NAME]"}</span>
        {!spec.signature.civilian && (
          <span>{spec.signature.rankBranch || "[RANK, BRANCH]"}</span>
        )}
        <span>{spec.signature.title[0] || "[TITLE]"}</span>
      </div>
    </div>
  );
}

function PreviewDialog({
  onClose,
  returnFocusRef,
  spec
}: StructuralPreviewProps & {
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [onClose, returnFocusRef]);

  return (
    <div className="modal-backdrop preview-backdrop" role="presentation">
      <section
        aria-labelledby="expanded-preview-title"
        aria-modal="true"
        className="modal preview-modal"
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="section-kicker">Word layout approximation</p>
            <h2 id="expanded-preview-title">Expanded preview</h2>
          </div>
          <button
            className="secondary-button"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            Close preview
          </button>
        </div>
        <p className="helper-text">
          Final pagination, wrapping, and centering are set in the downloaded Word document.
        </p>
        <PaperPreview expanded spec={spec} />
      </section>
    </div>
  );
}

export function StructuralPreview({ spec }: StructuralPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <section className="preview-section" aria-labelledby="preview-title">
      <div className="section-heading-row">
        <h2 id="preview-title">Structural preview</h2>
        <button
          className="text-button"
          onClick={() => setExpanded(true)}
          ref={expandButtonRef}
          type="button"
        >
          Expand preview
        </button>
      </div>
      <p className="helper-text">Final spacing and centering are set in Word.</p>
      <PaperPreview spec={spec} />
      {expanded && (
        <PreviewDialog
          onClose={() => setExpanded(false)}
          returnFocusRef={expandButtonRef}
          spec={spec}
        />
      )}
    </section>
  );
}
