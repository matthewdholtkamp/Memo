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
        responseMimeType: "application/json"
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

  return assistantResponseSchema.parse(extractJson(text));
}
