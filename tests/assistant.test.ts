import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAssistantPatch } from "../src/assistant/apply";
import { callMemoAssistant } from "../src/assistant/client";
import {
  ASSISTANT_FALLBACK_MODEL,
  ASSISTANT_MODEL,
  ASSISTANT_WORKER_URL
} from "../src/assistant/schema";
import { validateMemo } from "../src/validation/validate";
import { createSyntheticSpec } from "./fixtures";

function geminiResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }]
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

describe("ArmyMemo assistant", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies safe memo patches without changing letterhead-owned fields", () => {
    const spec = createSyntheticSpec();
    const next = applyAssistantPatch(spec, {
      subject: "Appointment Orders",
      paragraphs: [{ text: "Purpose.  This appoints the action officer.", children: [] }],
      signature: { name: "Alex Q. Example" },
      enclosures: ["Appointment roster"]
    });

    expect(next.subject).toBe("Appointment Orders");
    expect(next.paragraphs[0].text).toBe("Purpose.  This appoints the action officer.");
    expect(next.signature.name).toBe("Alex Q. Example");
    expect(next.signature.rankBranch).toBe(spec.signature.rankBranch);
    expect(next.enclosures).toEqual(["Appointment roster"]);
    expect(next.letterhead).toEqual(spec.letterhead);
    expect(next.profileId).toBe(spec.profileId);
  });

  it("calls the shared Bandaid6 Gemini Worker with the same model settings and no API key", async () => {
    const spec = createSyntheticSpec({
      letterhead: {
        ...createSyntheticSpec().letterhead,
        sealImageDataUrl: "data:image/png;base64,private-local-seal"
      }
    });
    const payload = {
      assistantMessage: "I updated the memo fields.",
      action: "applyPatch",
      memoPatch: { subject: "Clinic Workflow Update" },
      changedFields: [{ field: "subject" }],
      warnings: [],
      questions: []
    };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      geminiResponse(JSON.stringify(payload))
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await callMemoAssistant({
      instruction: "Make this a memo.",
      messages: [],
      spec,
      validationItems: validateMemo(spec).items
    });

    expect(response.memoPatch?.subject).toBe("Clinic Workflow Update");
    expect(fetchMock).toHaveBeenCalledWith(
      `${ASSISTANT_WORKER_URL}?stream=0`,
      expect.objectContaining({ method: "POST" })
    );
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe(ASSISTANT_MODEL);
    expect(body.fallbackModel).toBe(ASSISTANT_FALLBACK_MODEL);
    expect(body.stream).toBe(false);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.properties.memoPatch.properties.subject.type).toBe("string");
    expect(body.generationConfig.responseSchema.properties.action.enum).toContain("applyPatch");
    expect(JSON.stringify(body)).not.toContain("GEMINI_API_KEY");
    expect(JSON.stringify(body)).not.toContain("private-local-seal");
  });

  it("recovers a full assistant response nested inside assistantMessage", async () => {
    const nested = {
      assistantMessage: "I recovered and updated the memo fields.",
      action: "applyPatch",
      memoPatch: {
        subject: "Recovered Training Update",
        paragraphs: [{ text: "Purpose.  This memo records the recovered update.", children: [] }]
      },
      changedFields: [{ field: "subject" }, { field: "body paragraphs" }],
      warnings: [],
      questions: []
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        geminiResponse(
          JSON.stringify({
            assistantMessage: `\`\`\`json\n${JSON.stringify(nested, null, 2)}\n\`\`\``,
            action: "noChange",
            memoPatch: null,
            changedFields: [],
            warnings: [],
            questions: []
          })
        )
      )
    );

    const response = await callMemoAssistant({
      instruction: "Convert this pasted text.",
      messages: [],
      spec: createSyntheticSpec(),
      validationItems: []
    });

    expect(response.action).toBe("applyPatch");
    expect(response.assistantMessage).toBe("I recovered and updated the memo fields.");
    expect(response.memoPatch?.subject).toBe("Recovered Training Update");
    expect(response.changedFields.map(({ field }) => field)).toEqual([
      "subject",
      "body paragraphs"
    ]);
  });

  it("recovers a raw memo patch nested inside assistantMessage", async () => {
    const nestedPatch = {
      subject: "Raw Patch Subject",
      paragraphs: [{ text: "Purpose.  This patch came from nested JSON.", children: [] }]
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        geminiResponse(
          JSON.stringify({
            assistantMessage: JSON.stringify(nestedPatch, null, 2),
            action: "noChange",
            memoPatch: null,
            changedFields: [],
            warnings: ["Review the recovered memo fields."],
            questions: []
          })
        )
      )
    );

    const response = await callMemoAssistant({
      instruction: "Convert this pasted text.",
      messages: [],
      spec: createSyntheticSpec(),
      validationItems: []
    });

    expect(response.action).toBe("applyPatch");
    expect(response.assistantMessage).toBe("I updated the memo fields from the assistant response.");
    expect(response.memoPatch?.subject).toBe("Raw Patch Subject");
    expect(response.changedFields.map(({ field }) => field)).toEqual(["subject", "paragraphs"]);
    expect(response.warnings).toEqual(["Review the recovered memo fields."]);
  });

  it("rejects invalid memo JSON nested inside assistantMessage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        geminiResponse(
          JSON.stringify({
            assistantMessage: "```json\n{\"subject\":\n```",
            action: "noChange",
            memoPatch: null,
            changedFields: [],
            warnings: [],
            questions: []
          })
        )
      )
    );

    await expect(
      callMemoAssistant({
        instruction: "Convert this pasted text.",
        messages: [],
        spec: createSyntheticSpec(),
        validationItems: []
      })
    ).rejects.toThrow(/not valid enough to apply/);
  });

  it("rejects assistant text that is not structured memo JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => geminiResponse("Here is some prose.")));

    await expect(
      callMemoAssistant({
        instruction: "Make this a memo.",
        messages: [],
        spec: createSyntheticSpec(),
        validationItems: []
      })
    ).rejects.toThrow(/structured memo JSON/);
  });
});
