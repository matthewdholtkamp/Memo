import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { downloadDocx } from "./generator/download";
import {
  blocksToParagraphs,
  flattenParagraphs,
  normalizeBlockDepths,
  numberLabel,
  type EditorBlock
} from "./model/blocks";
import { createDefaultSpec, DEFAULT_ACKNOWLEDGMENT } from "./model/defaultSpec";
import {
  clearActiveDraft,
  exportDraft,
  importDraft,
  restoreActiveDraft,
  saveActiveDraft
} from "./model/drafts";
import type { MemoSpec } from "./model/memoSpec";
import {
  builtInProfiles,
  createCustomProfile,
  exportProfile,
  importProfile,
  profileToSnapshot,
  refreshBuiltInLetterhead,
  type LetterheadProfile
} from "./model/profiles";
import { imageFileToDataUrl, materializeBundledSeal } from "./model/seals";
import {
  fixSentenceSpacing,
  validateMemo,
  type ComplianceItem,
  type MemoStage
} from "./validation/validate";
import { CompliancePanel } from "./ui/CompliancePanel";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  PlusIcon,
  TrashIcon
} from "./ui/icons";
import { MemoStageStrip } from "./ui/MemoStageStrip";
import { StructuralPreview } from "./ui/StructuralPreview";

const STAGE_TARGETS: Record<MemoStage, string> = {
  setup: "setup-stage",
  body: "body-stage",
  closing: "closing-stage",
  review: "review-stage"
};

function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function readTextFile(file: File): Promise<string> {
  return file.text();
}

function StringListEditor({
  id,
  label,
  values,
  onChange,
  placeholder
}: {
  id?: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="field-group" id={id} tabIndex={id ? -1 : undefined}>
      <div className="list-label-row">
        <span className="field-label">{label}</span>
        <button
          className="text-button"
          onClick={() => onChange([...values, ""])}
          type="button"
        >
          <PlusIcon /> Add
        </button>
      </div>
      {values.length === 0 && <span className="empty-field-hint">None added</span>}
      {values.map((value, index) => (
        <div className="inline-field-row" key={`${label}-${index}`}>
          <input
            aria-label={`${label} ${index + 1}`}
            onChange={(event) =>
              onChange(values.map((entry, entryIndex) => (entryIndex === index ? event.target.value : entry)))
            }
            placeholder={placeholder}
            value={value}
          />
          <button
            aria-label={`Remove ${label} ${index + 1}`}
            className="icon-button"
            onClick={() => onChange(values.filter((_, entryIndex) => entryIndex !== index))}
            type="button"
          >
            <TrashIcon />
          </button>
        </div>
      ))}
    </div>
  );
}

function MemoBlockEditor({
  blocks,
  onChange
}: {
  blocks: EditorBlock[];
  onChange: (blocks: EditorBlock[]) => void;
}) {
  const updateBlock = (id: string, update: Partial<EditorBlock>) => {
    onChange(blocks.map((block) => (block.id === id ? { ...block, ...update } : block)));
  };
  const moveBlock = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(normalizeBlockDepths(next));
  };
  const deleteBlock = (index: number) => {
    const next = blocks.filter((_, entryIndex) => entryIndex !== index);
    onChange(next.length ? normalizeBlockDepths(next) : [{ id: crypto.randomUUID(), depth: 0, text: "" }]);
  };
  const addAfter = (index: number, depth: number) => {
    const next = [...blocks];
    next.splice(index + 1, 0, { id: crypto.randomUUID(), depth, text: "" });
    onChange(normalizeBlockDepths(next));
  };

  return (
    <div
      aria-label="Memorandum paragraph blocks"
      className="memo-block-list"
      id="body-blocks"
      tabIndex={-1}
    >
      {blocks.map((block, index) => (
        <div
          className="memo-block"
          key={block.id}
          style={{ "--block-depth": block.depth } as React.CSSProperties}
        >
          <span className="block-number">{numberLabel(block, index, blocks)}</span>
          <textarea
            aria-label={`Paragraph ${index + 1}`}
            onChange={(event) => updateBlock(block.id, { text: event.target.value })}
            placeholder="Type paragraph text. Numbering is added automatically."
            rows={3}
            value={block.text}
          />
          <div className="block-actions">
            <button
              aria-label={`Outdent paragraph ${index + 1}`}
              className="icon-button"
              disabled={block.depth === 0}
              onClick={() => updateBlock(block.id, { depth: Math.max(0, block.depth - 1) })}
              title="Outdent"
              type="button"
            >
              <ArrowLeftIcon />
            </button>
            <button
              aria-label={`Indent paragraph ${index + 1}`}
              className="icon-button"
              disabled={index === 0 || block.depth >= Math.min(5, blocks[index - 1].depth + 1)}
              onClick={() => updateBlock(block.id, { depth: block.depth + 1 })}
              title="Indent"
              type="button"
            >
              <ArrowRightIcon />
            </button>
            <button
              aria-label={`Move paragraph ${index + 1} up`}
              className="icon-button"
              disabled={index === 0}
              onClick={() => moveBlock(index, -1)}
              title="Move up"
              type="button"
            >
              <ArrowUpIcon />
            </button>
            <button
              aria-label={`Move paragraph ${index + 1} down`}
              className="icon-button"
              disabled={index === blocks.length - 1}
              onClick={() => moveBlock(index, 1)}
              title="Move down"
              type="button"
            >
              <ArrowDownIcon />
            </button>
            <button
              aria-label={`Delete paragraph ${index + 1}`}
              className="icon-button"
              onClick={() => deleteBlock(index)}
              title="Delete"
              type="button"
            >
              <TrashIcon />
            </button>
          </div>
          <div className="block-add-actions">
            <button className="text-button" onClick={() => addAfter(index, block.depth)} type="button">
              Add paragraph
            </button>
            <button className="text-button" onClick={() => addAfter(index, Math.min(5, block.depth + 1))} type="button">
              Add subparagraph
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CacGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby="cac-guide-title" aria-modal="true" className="modal" role="dialog">
        <div className="modal-heading">
          <div>
            <p className="section-kicker">Adobe handoff</p>
            <h2 id="cac-guide-title">CAC signing guide</h2>
          </div>
          <button className="secondary-button" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <ol>
          <li>Generate and review the unsigned Word memorandum.</li>
          <li>Complete the official date after signature coordination.</li>
          <li>Export the approved document to PDF using your authorized workflow.</li>
          <li>In Adobe Acrobat, place the CAC-secured digital signature field above the typed signature block.</li>
          <li>Follow your organization&apos;s records-management and release procedures.</li>
        </ol>
        <p className="notice-box">
          ArmyMemo prepares an unsigned formatting aid. It does not apply, validate, or replace a CAC-secured signature.
        </p>
      </section>
    </div>
  );
}

export default function App() {
  const restored = useMemo(() => restoreActiveDraft(), []);
  const [importedProfiles, setImportedProfiles] = useState<LetterheadProfile[]>(
    restored?.importedProfiles ?? []
  );
  const [spec, setSpec] = useState<MemoSpec>(() =>
    refreshBuiltInLetterhead(restored?.spec ?? createDefaultSpec())
  );
  const [blocks, setBlocks] = useState<EditorBlock[]>(() => flattenParagraphs(spec.paragraphs));
  const [feedback, setFeedback] = useState("Draft autosaves locally as you work.");
  const [spacingProposal, setSpacingProposal] = useState<MemoSpec | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeStage, setActiveStage] = useState<MemoStage>("setup");
  const draftInputRef = useRef<HTMLInputElement>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);
  const sealInputRef = useRef<HTMLInputElement>(null);

  const profiles = useMemo(
    () => [...builtInProfiles, ...importedProfiles],
    [importedProfiles]
  );
  const currentSpec = useMemo(
    () => ({ ...spec, paragraphs: blocksToParagraphs(blocks) }),
    [blocks, spec]
  );
  const validation = useMemo(() => validateMemo(currentSpec), [currentSpec]);
  const activeProfile = profiles.find((profile) => profile.id === spec.profileId);
  const customProfile = importedProfiles.find((profile) => profile.id === spec.profileId);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveActiveDraft(currentSpec, importedProfiles);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [currentSpec, importedProfiles]);

  const loadSpec = (nextSpec: MemoSpec) => {
    const refreshedSpec = refreshBuiltInLetterhead(nextSpec);
    setSpec(refreshedSpec);
    setBlocks(flattenParagraphs(refreshedSpec.paragraphs));
  };
  const updateCustomProfile = (update: Partial<LetterheadProfile>) => {
    if (!customProfile) return;
    const nextProfile = { ...customProfile, ...update };
    setImportedProfiles((profilesList) =>
      profilesList.map((profile) => (profile.id === nextProfile.id ? nextProfile : profile))
    );
    setSpec((current) => ({
      ...current,
      profileId: nextProfile.id,
      letterhead: profileToSnapshot(nextProfile),
      officeSymbol:
        update.defaultOfficeSymbol === undefined
          ? current.officeSymbol
          : nextProfile.defaultOfficeSymbol,
      font: nextProfile.defaultFont
    }));
  };
  const chooseProfile = (profileId: string) => {
    const profile = profiles.find((entry) => entry.id === profileId);
    if (!profile) return;
    setSpec((current) => ({
      ...current,
      profileId,
      letterhead: profileToSnapshot(profile),
      officeSymbol: profile.defaultOfficeSymbol,
      font: profile.defaultFont
    }));
  };
  const startCustomProfile = () => {
    const profile = createCustomProfile();
    setImportedProfiles((entries) => [...entries, profile]);
    setSpec((current) => ({
      ...current,
      profileId: profile.id,
      letterhead: profileToSnapshot(profile),
      officeSymbol: profile.defaultOfficeSymbol,
      font: profile.defaultFont
    }));
  };
  const resetDraft = () => {
    clearActiveDraft();
    loadSpec(createDefaultSpec());
    setImportedProfiles([]);
    setActiveStage("setup");
    setFeedback("Started a new local memo.");
  };
  const navigateToStage = (stage: MemoStage, focusTarget = STAGE_TARGETS[stage]) => {
    setActiveStage(stage);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(focusTarget);
      target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      target?.focus({ preventScroll: true });
    });
  };
  const navigateToComplianceItem = (item: ComplianceItem) => {
    navigateToStage(item.stage, item.focusTarget);
  };
  const handleType = (type: MemoSpec["type"]) => {
    setSpec((current) => ({
      ...current,
      type,
      acknowledgment:
        type === "counseling"
          ? current.acknowledgment ?? {
              statement: DEFAULT_ACKNOWLEDGMENT,
              signers: [{ label: "[RATED OFFICER]" }, { label: "[RATER OR SENIOR RATER]" }]
            }
          : null
    }));
  };
  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      setFeedback("Preparing the unsigned Word memorandum...");
      await downloadDocx(await materializeBundledSeal(currentSpec));
      setFeedback("Downloaded unsigned .docx. Use the CAC signing guide for the Adobe handoff.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not generate the document.");
    } finally {
      setIsGenerating(false);
    }
  };
  const handleDraftImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const envelope = importDraft(await readTextFile(file));
      setImportedProfiles(envelope.importedProfiles);
      loadSpec(envelope.spec);
      setFeedback("Loaded the local draft JSON.");
    } catch {
      setFeedback("That draft file is not a valid ArmyMemo JSON export.");
    }
    event.target.value = "";
  };
  const handleProfileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const profile = importProfile(await readTextFile(file));
      setImportedProfiles((entries) => [...entries.filter(({ id }) => id !== profile.id), profile]);
      chooseProfile(profile.id);
      setSpec((current) => ({
        ...current,
        profileId: profile.id,
        letterhead: profileToSnapshot(profile),
        officeSymbol: profile.defaultOfficeSymbol,
        font: profile.defaultFont
      }));
      setFeedback(`Imported profile: ${profile.displayName}.`);
    } catch {
      setFeedback("That profile file is not a valid ArmyMemo profile.");
    }
    event.target.value = "";
  };
  const handleSealUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      updateCustomProfile({
        sealAssetPath: null,
        sealImageDataUrl: await imageFileToDataUrl(file)
      });
      setFeedback("Attached the seal locally. It stays in this browser draft.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not attach the seal.");
    }
    event.target.value = "";
  };
  const applySpacingProposal = () => {
    if (!spacingProposal) return;
    loadSpec(spacingProposal);
    setSpacingProposal(null);
    setFeedback("Applied the sentence-spacing corrections to the editable draft.");
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <span className="brand-mark">AM</span>
          <span className="brand-name">ArmyMemo</span>
        </div>
        <nav aria-label="Utility actions">
          <button className="header-button" onClick={resetDraft} type="button">
            New memo
          </button>
          <button className="header-button" onClick={() => setShowGuide(true)} type="button">
            CAC signing guide
          </button>
        </nav>
      </header>
      <div className="privacy-bar">
        <span><strong>Autosaved on this device only.</strong> Memo text never leaves this browser.</span>
        <button className="text-button" onClick={() => { clearActiveDraft(); setFeedback("Cleared the saved browser draft. Current edits remain open."); }} type="button">
          Clear saved draft
        </button>
      </div>
      <MemoStageStrip
        activeStage={activeStage}
        onSelect={navigateToStage}
        validation={validation}
      />

      <main className="workspace">
        <aside
          aria-label="Memo setup"
          className="setup-rail"
          id="setup-stage"
          tabIndex={-1}
        >
          <div className="rail-heading">
            <p className="section-kicker">Document settings</p>
            <h1>Memo setup</h1>
          </div>
          <fieldset>
            <legend>Document type</legend>
            {([
              ["memo", "Standard Memo"],
              ["mfr", "MFR"],
              ["counseling", "Counseling"]
            ] as const).map(([value, label]) => (
              <label className="radio-label" key={value}>
                <input
                  checked={spec.type === value}
                  name="document-type"
                  onChange={() => handleType(value)}
                  type="radio"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="field-group">
            <span className="field-label">Letterhead profile</span>
            <select id="letterhead-profile" onChange={(event) => chooseProfile(event.target.value)} value={spec.profileId}>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row compact">
            <button className="text-button" onClick={startCustomProfile} type="button">New custom</button>
            <button className="text-button" onClick={() => profileInputRef.current?.click()} type="button">Import profile</button>
            <button
              className="text-button"
              disabled={!activeProfile}
              onClick={() => activeProfile && downloadText(exportProfile(activeProfile), `${activeProfile.id}.profile.json`)}
              type="button"
            >
              Export
            </button>
          </div>
          {customProfile && (
            <div className="custom-profile-box">
              <label className="field-group">
                <span className="field-label">Profile name</span>
                <input value={customProfile.displayName} onChange={(event) => updateCustomProfile({ displayName: event.target.value })} />
              </label>
              <label className="field-group">
                <span className="field-label">Organization lines</span>
                <textarea
                  rows={4}
                  value={customProfile.orgLines.join("\n")}
                  onChange={(event) => updateCustomProfile({ orgLines: event.target.value.split("\n") })}
                />
              </label>
              <button className="secondary-button" onClick={() => sealInputRef.current?.click()} type="button">
                Upload authorized seal
              </button>
            </div>
          )}
          <label className="field-group">
            <span className="field-label">Office symbol</span>
            <input value={spec.officeSymbol} onChange={(event) => setSpec({ ...spec, officeSymbol: event.target.value })} />
          </label>
          <label className="field-group">
            <span className="field-label">ARIMS record number <small>Optional</small></span>
            <input
              id="arims-record-number"
              placeholder="Add when known"
              value={spec.arimsRecordNumber}
              onChange={(event) => setSpec({ ...spec, arimsRecordNumber: event.target.value })}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Date</span>
            <input id="memo-date" placeholder="1 June 2026 or [DATE]" value={spec.date} onChange={(event) => setSpec({ ...spec, date: event.target.value })} />
          </label>
          <label className="field-group">
            <span className="field-label">Suspense <small>Optional</small></span>
            <input placeholder="1 July 2026" value={spec.suspense ?? ""} onChange={(event) => setSpec({ ...spec, suspense: event.target.value || null })} />
          </label>
          {spec.type === "memo" && (
            <StringListEditor id="addressee-list" label="Addressee" onChange={(addressees) => setSpec({ ...spec, addressees })} placeholder="Office or organization" values={spec.addressees} />
          )}
          <label className="field-group">
            <span className="field-label">Subject</span>
            <input id="memo-subject" placeholder="One subject, preferably 10 words or fewer" value={spec.subject} onChange={(event) => setSpec({ ...spec, subject: event.target.value })} />
          </label>
          <div className="guide-next">
            <button className="secondary-button" onClick={() => navigateToStage("body")} type="button">
              Continue to body
            </button>
          </div>
        </aside>

        <section className="editor-column" aria-label="Memo editor">
          <div className="editor-heading" id="body-stage" tabIndex={-1}>
            <div>
              <p className="section-kicker">Memorandum content</p>
              <h2>Body</h2>
            </div>
          </div>
          <MemoBlockEditor blocks={blocks} onChange={setBlocks} />
          <div className="editor-tools">
            <button id="sentence-spacing-tool" className="secondary-button" onClick={() => setSpacingProposal(fixSentenceSpacing(currentSpec))} type="button">
              Fix sentence spacing
            </button>
            <span>AR 25-50 requires two spaces after periods and question marks.</span>
          </div>
          {spacingProposal && (
            <div className="proposal-banner" role="status">
              <span>Preview ready: apply the sentence-spacing corrections to the editable draft?</span>
              <div className="button-row">
                <button className="secondary-button" onClick={applySpacingProposal} type="button">Apply corrections</button>
                <button className="text-button" onClick={() => setSpacingProposal(null)} type="button">Cancel</button>
              </div>
            </div>
          )}
          <div className="guide-next body-next">
            <button className="secondary-button" onClick={() => navigateToStage("closing")} type="button">
              Continue to closing
            </button>
          </div>

          <section className="closing-section" id="closing-stage" aria-labelledby="closing-title" tabIndex={-1}>
            <div className="section-heading-row">
              <div>
                <p className="section-kicker">Final block</p>
                <h2 id="closing-title">Closing</h2>
              </div>
              <label className="toggle-label">
                <input checked={Boolean(spec.authorityLine)} onChange={(event) => setSpec({ ...spec, authorityLine: event.target.checked ? "FOR THE COMMANDER:" : null })} type="checkbox" />
                Authority line
              </label>
            </div>
            {spec.authorityLine && (
              <label className="field-group">
                <span className="field-label">Authority line</span>
                <input value={spec.authorityLine} onChange={(event) => setSpec({ ...spec, authorityLine: event.target.value })} />
              </label>
            )}
            <div className="form-grid three">
              <label className="field-group">
                <span className="field-label">Name</span>
                <input id="signature-name" value={spec.signature.name} onChange={(event) => setSpec({ ...spec, signature: { ...spec.signature, name: event.target.value } })} />
              </label>
              <label className="field-group">
                <span className="field-label">Rank + branch</span>
                <input disabled={spec.signature.civilian} placeholder="LTC, MC" value={spec.signature.rankBranch} onChange={(event) => setSpec({ ...spec, signature: { ...spec.signature, rankBranch: event.target.value } })} />
              </label>
              <label className="field-group">
                <span className="field-label">Title</span>
                <input value={spec.signature.title[0]} onChange={(event) => setSpec({ ...spec, signature: { ...spec.signature, title: [event.target.value] } })} />
              </label>
            </div>
            <label className="toggle-label">
              <input checked={spec.signature.civilian} onChange={(event) => setSpec({ ...spec, signature: { ...spec.signature, civilian: event.target.checked } })} type="checkbox" />
              Civilian signature block
            </label>
            <details>
              <summary>
                Advanced options
                <small>Routing, enclosures, CF, distribution, and counseling</small>
              </summary>
              <div className="details-grid">
                <StringListEditor label="THRU" onChange={(thru) => setSpec({ ...spec, thru })} placeholder="Intermediate headquarters" values={spec.thru} />
                <StringListEditor label="Enclosures" onChange={(enclosures) => setSpec({ ...spec, enclosures })} placeholder="Enclosure description" values={spec.enclosures} />
                <StringListEditor label="CF recipients" onChange={(cfRecipients) => setSpec({ ...spec, cfRecipients })} placeholder="Copy furnished recipient" values={spec.cfRecipients} />
                <StringListEditor label="Distribution" onChange={(distribution) => setSpec({ ...spec, distribution })} placeholder="Distribution recipient" values={spec.distribution} />
              </div>
              {spec.type === "counseling" && spec.acknowledgment && (
                <label className="field-group">
                  <span className="field-label">Acknowledgment statement</span>
                  <textarea rows={3} value={spec.acknowledgment.statement} onChange={(event) => setSpec({ ...spec, acknowledgment: spec.acknowledgment ? { ...spec.acknowledgment, statement: event.target.value } : null })} />
                </label>
              )}
            </details>
            <div className="guide-next">
              <button className="secondary-button" onClick={() => navigateToStage("review")} type="button">
                Review memo
              </button>
            </div>
          </section>
        </section>

        <aside className="review-rail" id="review-stage" aria-label="Memo review" tabIndex={-1}>
          <CompliancePanel onNavigate={navigateToComplianceItem} validation={validation} />
          <StructuralPreview spec={currentSpec} />
        </aside>
      </main>

      <footer className="action-bar">
        <div className="button-row">
          <button className="primary-button" disabled={!validation.canGenerate || isGenerating} onClick={handleGenerate} type="button">{isGenerating ? "Generating..." : "Generate .docx"}</button>
          <button className="secondary-button" onClick={() => downloadText(exportDraft(currentSpec, importedProfiles), "armymemo-draft.json")} type="button">Save draft JSON</button>
          <button className="secondary-button" onClick={() => draftInputRef.current?.click()} type="button">Load draft</button>
          <button className="secondary-button" onClick={() => { const example = createDefaultSpec(); example.arimsRecordNumber = "25-50a"; example.subject = "Clinic Workflow Update"; example.addressees = ["All Clinical Section Leaders"]; example.paragraphs = [{ text: "Purpose.  This memorandum establishes a simple clinic workflow update.", children: [] }, { text: "Section leaders will review the update with their teams.", children: [] }]; example.signature = { name: "Jordan A. Rivera", rankBranch: "LTC, MC", title: ["Deputy Commander for Clinical Services"], civilian: false }; loadSpec(example); }} type="button">Load example</button>
        </div>
        <div className="action-status">
          <strong>{validation.canGenerate ? "Ready to prepare an unsigned Word memorandum." : "Resolve the compliance errors before generating."}</strong>
          <span>{feedback}</span>
        </div>
      </footer>

      <input accept="application/json" hidden onChange={handleDraftImport} ref={draftInputRef} type="file" />
      <input accept="application/json" hidden onChange={handleProfileImport} ref={profileInputRef} type="file" />
      <input accept="image/png,image/jpeg" hidden onChange={handleSealUpload} ref={sealInputRef} type="file" />
      {showGuide && <CacGuide onClose={() => setShowGuide(false)} />}
    </div>
  );
}
