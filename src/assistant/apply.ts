import { DEFAULT_ACKNOWLEDGMENT } from "../model/defaultSpec";
import { cloneSpec, type MemoSpec } from "../model/memoSpec";
import type { AssistantPatch, AssistantResponse } from "./schema";

const FIELD_LABELS: Record<keyof AssistantPatch, string> = {
  type: "document type",
  officeSymbol: "office symbol",
  arimsRecordNumber: "ARIMS record number",
  date: "date",
  suspense: "suspense",
  subject: "subject",
  addressees: "addressees",
  thru: "THRU routing",
  paragraphs: "body paragraphs",
  authorityLine: "authority line",
  signature: "signature block",
  enclosures: "enclosures",
  cfRecipients: "CF recipients",
  distribution: "distribution",
  acknowledgment: "counseling acknowledgment"
};

export function summarizePatchFields(patch: AssistantPatch): string[] {
  return (Object.keys(patch) as Array<keyof AssistantPatch>).map(
    (field) => FIELD_LABELS[field] ?? field
  );
}

function normalizeStringList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

export function applyAssistantPatch(baseSpec: MemoSpec, patch: AssistantPatch): MemoSpec {
  const next = cloneSpec(baseSpec);

  if (patch.type !== undefined) {
    next.type = patch.type;
    if (patch.type === "counseling" && !next.acknowledgment) {
      next.acknowledgment = {
        statement: DEFAULT_ACKNOWLEDGMENT,
        signers: [{ label: "[RATED OFFICER]" }, { label: "[RATER OR SENIOR RATER]" }]
      };
    }
    if (patch.type !== "counseling" && patch.acknowledgment === undefined) {
      next.acknowledgment = null;
    }
  }
  if (patch.officeSymbol !== undefined) next.officeSymbol = patch.officeSymbol.trim();
  if (patch.arimsRecordNumber !== undefined) next.arimsRecordNumber = patch.arimsRecordNumber.trim();
  if (patch.date !== undefined) next.date = patch.date.trim();
  if (patch.suspense !== undefined) next.suspense = patch.suspense?.trim() || null;
  if (patch.subject !== undefined) next.subject = patch.subject.trim();
  if (patch.addressees !== undefined) next.addressees = normalizeStringList(patch.addressees);
  if (patch.thru !== undefined) next.thru = normalizeStringList(patch.thru);
  if (patch.paragraphs !== undefined && patch.paragraphs.length > 0) {
    next.paragraphs = patch.paragraphs;
  }
  if (patch.authorityLine !== undefined) next.authorityLine = patch.authorityLine?.trim() || null;
  if (patch.signature !== undefined) {
    next.signature = {
      ...next.signature,
      ...patch.signature,
      name: patch.signature.name?.trim() ?? next.signature.name,
      rankBranch: patch.signature.rankBranch?.trim() ?? next.signature.rankBranch,
      title: patch.signature.title?.map((line) => line.trim()).filter(Boolean) ?? next.signature.title
    };
  }
  if (patch.enclosures !== undefined) next.enclosures = normalizeStringList(patch.enclosures);
  if (patch.cfRecipients !== undefined) next.cfRecipients = normalizeStringList(patch.cfRecipients);
  if (patch.distribution !== undefined) next.distribution = normalizeStringList(patch.distribution);
  if (patch.acknowledgment !== undefined) next.acknowledgment = patch.acknowledgment;

  return next;
}

export function appliedFieldsFromResponse(response: AssistantResponse): string[] {
  if (response.changedFields.length > 0) {
    return response.changedFields.map(({ field }) => field);
  }
  return response.memoPatch ? summarizePatchFields(response.memoPatch) : [];
}
