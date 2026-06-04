import type { MemoSpec } from "../model/memoSpec";
import type { ComplianceItem } from "../validation/validate";
import {
  ASSISTANT_FALLBACK_MODEL,
  ASSISTANT_MODEL,
  ASSISTANT_WORKER_URL,
  assistantResponseSchema,
  type AssistantMessage,
  type AssistantResponse
} from "./schema";

const ARMYMEMO_ASSISTANT_PROMPT = `You are Dr. Holtkamp Memo Assist inside ArmyMemo.

Mission:
- Help users convert rough notes, old memorandum text, or plain-language instructions into an ArmyMemo draft.
- Return only strict JSON matching the requested response shape. Do not use Markdown fences.
- The browser app validates and formats the memo; you only propose field updates.

ArmyMemo rules:
- Follow AR 25-50 memorandum conventions at a formatting-aid level.
- Supported document types are "memo", "mfr", and "counseling".
- Do not create MOU, MOA, decision memorandum, letter, OER, NCOER, CAC-signing, legal-review, or AI-authored official approval workflows.
- Do not change letterhead, profileId, seal assets, font, fontSizePt, or specVersion.
- ARIMS record number is optional in this app. Fill it only if the user provides it.
- Use office symbol, date, suspense, subject, addressees, THRU, body paragraphs, signature, enclosures, CF, distribution, and counseling acknowledgment when supported by user input.
- If the user gives more than five direct addressees, prefer distribution entries instead of forcing all direct addressees.
- Keep subjects concise, ideally 10 words or fewer.
- Body paragraph text must not include manual labels such as "1.", "a.", or "(1)" because ArmyMemo adds numbering automatically.
- Use two spaces after sentence-ending periods and question marks in generated body text.
- Leave unknown signer, addressee, routing, or authority details blank unless the user provides them. Ask concise follow-up questions when critical facts are missing.
- Never include classified information, PHI, patient details, or private example memo content.

JSON response shape:
{
  "assistantMessage": "Brief explanation for the user.",
  "action": "applyPatch" | "askClarifyingQuestion" | "noChange",
  "memoPatch": {
    "type": "memo" | "mfr" | "counseling",
    "officeSymbol": "string",
    "arimsRecordNumber": "string",
    "date": "1 June 2026 or [DATE]",
    "suspense": "string or null",
    "subject": "string",
    "addressees": ["string"],
    "thru": ["string"],
    "paragraphs": [{ "text": "string", "children": [] }],
    "authorityLine": "string or null",
    "signature": { "name": "string", "rankBranch": "string", "title": ["string"], "civilian": false },
    "enclosures": ["string"],
    "cfRecipients": ["string"],
    "distribution": ["string"],
    "acknowledgment": null
  },
  "changedFields": [{ "field": "subject", "reason": "why changed" }],
  "warnings": ["short warning"],
  "questions": ["short question"]
}

Omit memoPatch keys that should not change. Use "askClarifyingQuestion" when you need user input before changing the memo.`;

function paragraphResponseSchema(depth = 0): Record<string, unknown> {
  const childItems =
    depth >= 4
      ? {
          type: "object",
          properties: {
            text: { type: "string" },
            children: { type: "array", items: {} }
          },
          required: ["text", "children"]
        }
      : paragraphResponseSchema(depth + 1);

  return {
    type: "object",
    properties: {
      text: { type: "string" },
      children: {
        type: "array",
        items: childItems
      }
    },
    required: ["text", "children"]
  };
}

const GEMINI_ASSISTANT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    assistantMessage: { type: "string" },
    action: {
      type: "string",
      enum: ["applyPatch", "askClarifyingQuestion", "noChange"]
    },
    memoPatch: {
      type: "object",
      nullable: true,
      properties: {
        type: { type: "string", enum: ["memo", "mfr", "counseling"] },
        officeSymbol: { type: "string" },
        arimsRecordNumber: { type: "string" },
        date: { type: "string" },
        suspense: { type: "string", nullable: true },
        subject: { type: "string" },
        addressees: { type: "array", items: { type: "string" } },
        thru: { type: "array", items: { type: "string" } },
        paragraphs: { type: "array", items: paragraphResponseSchema() },
        authorityLine: { type: "string", nullable: true },
        signature: {
          type: "object",
          properties: {
            name: { type: "string" },
            rankBranch: { type: "string" },
            title: { type: "array", items: { type: "string" } },
            civilian: { type: "boolean" }
          }
        },
        enclosures: { type: "array", items: { type: "string" } },
        cfRecipients: { type: "array", items: { type: "string" } },
        distribution: { type: "array", items: { type: "string" } },
        acknowledgment: { type: "object", nullable: true }
      }
    },
    changedFields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          reason: { type: "string" }
        },
        required: ["field"]
      }
    },
    warnings: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } }
  },
  required: ["assistantMessage", "action", "changedFields", "warnings", "questions"]
} as const;

const geminiTextResponseSchema = {
  parse(data: unknown): string {
    if (!data || typeof data !== "object") return "";
    const candidates = (data as { candidates?: unknown }).candidates;
    if (!Array.isArray(candidates)) return "";
    return candidates
      .flatMap((candidate) => {
        const parts = (candidate as { content?: { parts?: unknown } }).content?.parts;
        return Array.isArray(parts) ? parts : [];
      })
      .map((part) => (typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
      .join("")
      .trim();
  }
};

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("The assistant returned text instead of structured memo JSON.");
  }
}

function looksLikeJsonBlock(text: string): boolean {
  const trimmed = text.trim();
  return (
    /^```(?:json)?/i.test(trimmed) ||
    trimmed.startsWith("{") ||
    /"memoPatch"|"assistantMessage"|"paragraphs"|"subject"/.test(trimmed)
  );
}

function patchChangedFields(patch: unknown): Array<{ field: string }> {
  if (!patch || typeof patch !== "object") return [];
  return Object.keys(patch).map((field) => ({ field }));
}

type JsonRecord = Record<string, any>;
type NormalizedAssistantResponse = {
  assistantMessage: string;
  action: "applyPatch" | "askClarifyingQuestion" | "noChange";
  memoPatch: unknown;
  changedFields: Array<{ field: string; reason?: string }>;
  warnings: string[];
  questions: string[];
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : null;
}

function sanitizeParagraph(value: unknown, depth = 0): JsonRecord | null {
  const record = asRecord(value);
  if (!record || typeof record.text !== "string" || !Array.isArray(record.children)) {
    return null;
  }
  if (depth >= 5 && record.children.length > 0) return null;
  const children = record.children.map((child) => sanitizeParagraph(child, depth + 1));
  if (children.some((child) => !child)) return null;
  return { text: record.text, children };
}

function sanitizePatch(value: unknown): JsonRecord | null {
  const record = asRecord(value);
  if (!record) return null;

  const patch: JsonRecord = {};
  const stringFields = [
    "officeSymbol",
    "arimsRecordNumber",
    "date",
    "subject"
  ];
  const listFields = [
    "addressees",
    "thru",
    "enclosures",
    "cfRecipients",
    "distribution"
  ];

  if (
    typeof record.type === "string" &&
    ["memo", "mfr", "counseling"].includes(record.type)
  ) {
    patch.type = record.type;
  }
  for (const field of stringFields) {
    if (typeof record[field] === "string") patch[field] = record[field];
  }
  for (const field of ["suspense", "authorityLine"]) {
    if (record[field] === null || typeof record[field] === "string") {
      patch[field] = record[field];
    }
  }
  for (const field of listFields) {
    const values = stringList(record[field]);
    if (values) patch[field] = values;
  }
  if (Array.isArray(record.paragraphs)) {
    const paragraphs = record.paragraphs.map((paragraph) => sanitizeParagraph(paragraph));
    if (paragraphs.some((paragraph) => !paragraph)) return null;
    patch.paragraphs = paragraphs;
  }

  const signature = asRecord(record.signature);
  if (signature) {
    const nextSignature: JsonRecord = {};
    for (const field of ["name", "rankBranch"]) {
      if (typeof signature[field] === "string") nextSignature[field] = signature[field];
    }
    const title = stringList(signature.title);
    if (title) nextSignature.title = title;
    if (typeof signature.civilian === "boolean") nextSignature.civilian = signature.civilian;
    if (Object.keys(nextSignature).length > 0) patch.signature = nextSignature;
  }
  if (record.acknowledgment === null || asRecord(record.acknowledgment)) {
    patch.acknowledgment = record.acknowledgment;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function sanitizeChangedFields(value: unknown, fallbackPatch: unknown): Array<{ field: string; reason?: string }> {
  if (!Array.isArray(value)) return patchChangedFields(fallbackPatch);
  return value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record || typeof record.field !== "string") return null;
      return typeof record.reason === "string"
        ? { field: record.field, reason: record.reason }
        : { field: record.field };
    })
    .filter(Boolean) as Array<{ field: string; reason?: string }>;
}

function sanitizeAssistantResponse(value: unknown): NormalizedAssistantResponse | null {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.assistantMessage !== "string" ||
    typeof record.action !== "string" ||
    !["applyPatch", "askClarifyingQuestion", "noChange"].includes(record.action)
  ) {
    return null;
  }

  const memoPatch =
    record.memoPatch === null || record.memoPatch === undefined
      ? null
      : sanitizePatch(record.memoPatch);
  if (record.action === "applyPatch" && !memoPatch) return null;

  const response = {
    assistantMessage: record.assistantMessage,
    action: record.action as NormalizedAssistantResponse["action"],
    memoPatch,
    changedFields: sanitizeChangedFields(record.changedFields, memoPatch),
    warnings: stringList(record.warnings) ?? [],
    questions: stringList(record.questions) ?? []
  };
  return response;
}

function normalizeAssistantResponse(response: any): any {
  if (response.action === "applyPatch" && response.memoPatch) return response;
  if (!looksLikeJsonBlock(response.assistantMessage)) return response;

  let nestedJson: unknown;
  try {
    nestedJson = extractJson(response.assistantMessage);
  } catch {
    throw new Error("The assistant returned memo JSON in chat, but it was not valid enough to apply. Please send again.");
  }

  const nestedResponse = sanitizeAssistantResponse(nestedJson);
  if (nestedResponse) return nestedResponse;

  const nestedPatch = sanitizePatch(nestedJson);
  if (nestedPatch) return {
    assistantMessage: "I updated the memo fields from the assistant response.",
    action: "applyPatch",
    memoPatch: nestedPatch,
    changedFields: patchChangedFields(nestedPatch),
    warnings: response.warnings,
    questions: response.questions
  };

  throw new Error("The assistant returned memo JSON in chat, but it did not match ArmyMemo fields. Please send again.");
}

function stripSealData(spec: MemoSpec): MemoSpec {
  return {
    ...spec,
    letterhead: {
      ...spec.letterhead,
      sealImageDataUrl: spec.letterhead.sealImageDataUrl ? "[local seal omitted]" : null
    }
  };
}

export async function callMemoAssistant({
  instruction,
  messages,
  spec,
  validationItems
}: {
  instruction: string;
  messages: AssistantMessage[];
  spec: MemoSpec;
  validationItems: ComplianceItem[];
}): Promise<AssistantResponse> {
  const contents = [
    {
      role: "user",
      parts: [
        {
          text: JSON.stringify(
            {
              instruction,
              currentMemo: stripSealData(spec),
              compliance: validationItems.map(({ code, label, level, detail }) => ({
                code,
                label,
                level,
                detail
              })),
              recentConversation: messages.slice(-8).map(({ role, text }) => ({ role, text }))
            },
            null,
            2
          )
        }
      ]
    }
  ];

  const response = await fetch(`${ASSISTANT_WORKER_URL}?stream=0`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ASSISTANT_MODEL,
      fallbackModel: ASSISTANT_FALLBACK_MODEL,
      stream: false,
      systemInstruction: { role: "system", parts: [{ text: ARMYMEMO_ASSISTANT_PROMPT }] },
      contents,
      generationConfig: {
        temperature: 0.35,
        responseMimeType: "application/json",
        responseSchema: GEMINI_ASSISTANT_RESPONSE_SCHEMA
      }
    })
  });

  if (!response.ok) {
    throw new Error(`The Gemini Worker returned ${response.status}.`);
  }

  const text = geminiTextResponseSchema.parse(await response.json());
  if (!text) {
    throw new Error("The assistant returned an empty response.");
  }

  return normalizeAssistantResponse(assistantResponseSchema.parse(extractJson(text))) as AssistantResponse;
}
