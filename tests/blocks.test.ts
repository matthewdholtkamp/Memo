import { describe, expect, it } from "vitest";
import { blocksToParagraphs, numberLabel, parsePastedBlocks } from "../src/model/blocks";

describe("paragraph block helpers", () => {
  it("strips manual numbering when converting pasted paragraphs", () => {
    const blocks = parsePastedBlocks("1. First paragraph.\n\n2. Second paragraph.");
    expect(blocks.map(({ text }) => text)).toEqual([
      "First paragraph.",
      "Second paragraph."
    ]);
  });

  it("converts nested editor blocks into paragraph trees", () => {
    const paragraphs = blocksToParagraphs([
      { id: "1", depth: 0, text: "Parent" },
      { id: "2", depth: 1, text: "First child" },
      { id: "3", depth: 1, text: "Second child" }
    ]);
    expect(paragraphs[0].children).toHaveLength(2);
  });

  it("renders the AR 25-50 numbering hierarchy", () => {
    const blocks = [
      { depth: 0 },
      { depth: 1 },
      { depth: 1 },
      { depth: 2 },
      { depth: 3 },
      { depth: 4 },
      { depth: 5 }
    ];
    expect(blocks.map((block, index) => numberLabel(block, index, blocks))).toEqual([
      "1.",
      "a.",
      "b.",
      "(1)",
      "(a)",
      "1)",
      "a)"
    ]);
  });
});
