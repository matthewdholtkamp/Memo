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
    expect(JSON.stringify(body)).not.toContain("GEMINI_API_KEY");
    expect(JSON.stringify(body)).not.toContain("private-local-seal");
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
