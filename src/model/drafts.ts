import { z } from "zod";
import { memoSpecSchema, type MemoSpec } from "./memoSpec";
import { profileSchema, type LetterheadProfile } from "./profiles";

export const DRAFT_STORAGE_KEY = "armymemo.activeDraft.v1";
export const DRAFT_VERSION = 1 as const;

export const draftEnvelopeSchema = z.object({
  draftVersion: z.literal(DRAFT_VERSION),
  savedAt: z.string(),
  spec: memoSpecSchema,
  importedProfiles: z.array(profileSchema)
});
export type DraftEnvelope = z.infer<typeof draftEnvelopeSchema>;

export function createDraftEnvelope(
  spec: MemoSpec,
  importedProfiles: LetterheadProfile[]
): DraftEnvelope {
  return {
    draftVersion: DRAFT_VERSION,
    savedAt: new Date().toISOString(),
    spec,
    importedProfiles
  };
}

export function saveActiveDraft(
  spec: MemoSpec,
  importedProfiles: LetterheadProfile[]
): void {
  localStorage.setItem(
    DRAFT_STORAGE_KEY,
    JSON.stringify(createDraftEnvelope(spec, importedProfiles))
  );
}

export function restoreActiveDraft(): DraftEnvelope | null {
  const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!stored) return null;
  try {
    return draftEnvelopeSchema.parse(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function clearActiveDraft(): void {
  localStorage.removeItem(DRAFT_STORAGE_KEY);
}

export function exportDraft(
  spec: MemoSpec,
  importedProfiles: LetterheadProfile[]
): string {
  return JSON.stringify(createDraftEnvelope(spec, importedProfiles), null, 2);
}

export function importDraft(json: string): DraftEnvelope {
  return draftEnvelopeSchema.parse(JSON.parse(json));
}
