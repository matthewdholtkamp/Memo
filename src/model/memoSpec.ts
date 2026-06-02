import { z } from "zod";

export const SPEC_VERSION = 1 as const;

export const memoTypeSchema = z.enum(["memo", "mfr", "counseling"]);
export type MemoType = z.infer<typeof memoTypeSchema>;

export const fontSchema = z.enum(["Arial", "Times New Roman"]);
export type MemoFont = z.infer<typeof fontSchema>;

export const signerPresetSchema = z.object({
  name: z.string(),
  rankBranch: z.string(),
  title: z.array(z.string()).min(1)
});
export type SignerPreset = z.infer<typeof signerPresetSchema>;

export const letterheadSnapshotSchema = z.object({
  displayName: z.string(),
  orgLines: z.array(z.string()).min(1),
  sealAssetPath: z.string().nullable(),
  sealImageDataUrl: z.string().nullable()
});
export type LetterheadSnapshot = z.infer<typeof letterheadSnapshotSchema>;

export type ParagraphNode = {
  text: string;
  children: ParagraphNode[];
};

export const paragraphNodeSchema: z.ZodType<ParagraphNode> = z.lazy(() =>
  z.object({
    text: z.string(),
    children: z.array(paragraphNodeSchema)
  })
);

export const signatureSchema = z.object({
  name: z.string(),
  rankBranch: z.string(),
  title: z.array(z.string()).min(1),
  civilian: z.boolean()
});
export type Signature = z.infer<typeof signatureSchema>;

export const acknowledgmentSchema = z.object({
  statement: z.string(),
  signers: z.array(
    z.object({
      label: z.string()
    })
  )
});
export type Acknowledgment = z.infer<typeof acknowledgmentSchema>;

export const memoSpecSchema = z.object({
  specVersion: z.literal(SPEC_VERSION),
  type: memoTypeSchema,
  profileId: z.string(),
  letterhead: letterheadSnapshotSchema,
  officeSymbol: z.string(),
  arimsRecordNumber: z.string(),
  date: z.string(),
  suspense: z.string().nullable(),
  subject: z.string(),
  addressees: z.array(z.string()),
  thru: z.array(z.string()),
  font: fontSchema,
  fontSizePt: z.literal(12),
  paragraphs: z.array(paragraphNodeSchema),
  authorityLine: z.string().nullable(),
  signature: signatureSchema,
  enclosures: z.array(z.string()),
  cfRecipients: z.array(z.string()),
  distribution: z.array(z.string()),
  acknowledgment: acknowledgmentSchema.nullable()
});
export type MemoSpec = z.infer<typeof memoSpecSchema>;

export function cloneSpec(spec: MemoSpec): MemoSpec {
  return structuredClone(spec);
}
