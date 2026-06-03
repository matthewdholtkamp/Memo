import { z } from "zod";
import {
  acknowledgmentSchema,
  memoTypeSchema,
  paragraphNodeSchema,
  signatureSchema
} from "../model/memoSpec";

export const ASSISTANT_WORKER_URL = "https://bandaid6.mholtkamp.workers.dev";
export const ASSISTANT_MODEL = "gemini-3.1-flash-lite";
export const ASSISTANT_FALLBACK_MODEL = "gemini-2.5-flash";

export const assistantPatchSchema = z
  .object({
    type: memoTypeSchema.optional(),
    officeSymbol: z.string().optional(),
    arimsRecordNumber: z.string().optional(),
    date: z.string().optional(),
    suspense: z.string().nullable().optional(),
    subject: z.string().optional(),
    addressees: z.array(z.string()).optional(),
    thru: z.array(z.string()).optional(),
    paragraphs: z.array(paragraphNodeSchema).optional(),
    authorityLine: z.string().nullable().optional(),
    signature: signatureSchema.partial().optional(),
    enclosures: z.array(z.string()).optional(),
    cfRecipients: z.array(z.string()).optional(),
    distribution: z.array(z.string()).optional(),
    acknowledgment: acknowledgmentSchema.nullable().optional()
  })
  .strict();

export type AssistantPatch = z.infer<typeof assistantPatchSchema>;

export const assistantResponseSchema = z
  .object({
    assistantMessage: z.string(),
    action: z.enum(["applyPatch", "askClarifyingQuestion", "noChange"]),
    memoPatch: assistantPatchSchema.nullable().optional(),
    changedFields: z
      .array(
        z.object({
          field: z.string(),
          reason: z.string().optional()
        })
      )
      .default([]),
    warnings: z.array(z.string()).default([]),
    questions: z.array(z.string()).default([])
  })
  .strict();

export type AssistantResponse = z.infer<typeof assistantResponseSchema>;

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  appliedFields?: string[];
  warnings?: string[];
  questions?: string[];
};
