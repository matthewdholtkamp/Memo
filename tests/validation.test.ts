import { describe, expect, it } from "vitest";
import { createSyntheticSpec } from "./fixtures";
import { createDefaultSpec, formatMemoDate } from "../src/model/defaultSpec";
import { fixSentenceSpacing, validateMemo } from "../src/validation/validate";

describe("validateMemo", () => {
  it("formats fresh memo dates using the local Army memorandum style", () => {
    expect(formatMemoDate(new Date(2026, 5, 1))).toBe("1 June 2026");
    expect(createDefaultSpec().date).toBe(formatMemoDate());
  });

  it("warns without blocking when the ARIMS record number is missing", () => {
    const result = validateMemo(createSyntheticSpec({ arimsRecordNumber: "" }));
    expect(result.canGenerate).toBe(true);
    expect(result.warnings.map(({ code }) => code)).toContain("arims");
  });

  it("blocks lone subparagraphs", () => {
    const spec = createSyntheticSpec();
    spec.paragraphs[1].children = [spec.paragraphs[1].children[0]];
    const result = validateMemo(spec);
    expect(result.blockingErrors.map(({ code }) => code)).toContain("lone-child");
  });

  it("warns about subject length and sentence spacing", () => {
    const spec = createSyntheticSpec({
      subject: "A subject with more than ten words for this memorandum workflow update"
    });
    spec.paragraphs[0].text = "Purpose. This needs two spaces.";
    const result = validateMemo(spec);
    expect(result.warnings.map(({ code }) => code)).toContain("subject-length");
    expect(result.warnings.map(({ code }) => code)).toContain("sentence-spacing");
  });

  it("repairs sentence spacing without mutating the original spec", () => {
    const spec = createSyntheticSpec();
    spec.paragraphs[0].text = "Purpose. This needs correction? Yes.";
    const fixed = fixSentenceSpacing(spec);
    expect(fixed.paragraphs[0].text).toBe("Purpose.  This needs correction?  Yes.");
    expect(spec.paragraphs[0].text).toBe("Purpose. This needs correction? Yes.");
  });
});
