import type { ParagraphNode } from "./memoSpec";

export type EditorBlock = {
  id: string;
  depth: number;
  text: string;
};

export function flattenParagraphs(
  paragraphs: ParagraphNode[],
  depth = 0
): EditorBlock[] {
  return paragraphs.flatMap((paragraph) => [
    { id: crypto.randomUUID(), depth, text: paragraph.text },
    ...flattenParagraphs(paragraph.children, depth + 1)
  ]);
}

export function blocksToParagraphs(blocks: EditorBlock[]): ParagraphNode[] {
  const roots: ParagraphNode[] = [];
  const parentStack: ParagraphNode[] = [];

  blocks.forEach((block) => {
    const depth = Math.max(0, Math.min(block.depth, parentStack.length));
    const node: ParagraphNode = { text: block.text, children: [] };
    if (depth === 0) {
      roots.push(node);
    } else {
      parentStack[depth - 1].children.push(node);
    }
    parentStack[depth] = node;
    parentStack.length = depth + 1;
  });

  return roots;
}

export function normalizeBlockDepths(blocks: EditorBlock[]): EditorBlock[] {
  let previousDepth = 0;
  return blocks.map((block, index) => {
    const depth = index === 0 ? 0 : Math.min(block.depth, previousDepth + 1);
    previousDepth = depth;
    return { ...block, depth: Math.max(0, depth) };
  });
}

export function parsePastedBlocks(text: string): EditorBlock[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .replace(/\s+/g, " ")
        .replace(
          /^\s*(?:(?:\d+|[a-z])\.|\(\d+\)|\([a-z]\)|(?:\d+|[a-z])\))\s+/i,
          ""
        )
        .trim()
    )
    .filter(Boolean);

  return (paragraphs.length ? paragraphs : [""]).map((paragraph) => ({
    id: crypto.randomUUID(),
    depth: 0,
    text: paragraph
  }));
}

export function numberLabel(
  block: Pick<EditorBlock, "depth">,
  index: number,
  blocks: Pick<EditorBlock, "depth">[]
): string {
  const { depth } = block;
  const siblingsBefore = blocks
    .slice(0, index)
    .filter((candidate, candidateIndex) => {
      if (candidate.depth !== depth) return false;
      for (let scan = candidateIndex + 1; scan < index; scan += 1) {
        if (blocks[scan].depth < depth) return false;
      }
      return true;
    }).length;
  const ordinal = siblingsBefore + 1;
  const letter = String.fromCharCode(96 + Math.min(ordinal, 26));
  if (depth === 0) return `${ordinal}.`;
  if (depth === 1) return `${letter}.`;
  if (depth === 2) return `(${ordinal})`;
  if (depth === 3) return `(${letter})`;
  if (depth === 4) return `${ordinal})`;
  return `${letter})`;
}
