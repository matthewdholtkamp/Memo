import { mkdir, writeFile } from "node:fs/promises";
import { buildDocx } from "../src/generator/buildDocx";
import { SPEC_VERSION, type MemoSpec } from "../src/model/memoSpec";

const outputDir = new URL("../output/qa/", import.meta.url);
const sealDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function baseSpec(overrides: Partial<MemoSpec> = {}): MemoSpec {
  return {
    specVersion: SPEC_VERSION,
    type: "memo",
    profileId: "synthetic",
    letterhead: {
      displayName: "Synthetic QA Unit",
      orgLines: [
        "DEPARTMENT OF THE ARMY",
        "SYNTHETIC QUALITY ASSURANCE UNIT",
        "100 EXAMPLE AVENUE",
        "FORT EXAMPLE, MISSOURI 60000"
      ],
      sealAssetPath: null,
      sealImageDataUrl: sealDataUrl
    },
    officeSymbol: "ABCD-EF",
    arimsRecordNumber: "25-50a",
    date: "1 June 2026",
    suspense: null,
    subject: "Synthetic Workflow Update",
    addressees: ["All Section Leaders"],
    thru: [],
    font: "Arial",
    fontSizePt: 12,
    paragraphs: [
      {
        text: "Purpose.  This memorandum provides synthetic content for layout quality assurance.",
        children: []
      },
      {
        text: "Section leaders will review the synthetic workflow with their teams.",
        children: [
          { text: "Teams will identify implementation questions.", children: [] },
          { text: "Leaders will consolidate responses.", children: [] }
        ]
      }
    ],
    authorityLine: null,
    signature: {
      name: "Jordan A. Rivera",
      rankBranch: "LTC, MC",
      title: ["Deputy Commander for Clinical Services"],
      civilian: false
    },
    enclosures: [],
    cfRecipients: [],
    distribution: [],
    acknowledgment: null,
    ...overrides
  };
}

async function save(name: string, spec: MemoSpec): Promise<void> {
  const blob = await buildDocx(spec);
  await writeFile(new URL(name, outputDir), new Uint8Array(await blob.arrayBuffer()));
}

await mkdir(outputDir, { recursive: true });

await save("standard-memo.docx", baseSpec());
await save(
  "wrapped-heading-memo.docx",
  baseSpec({
    addressees: [
      "Synthetic Appointment Recipient, Deputy Director for an Intentionally Long Quality Assurance Organization"
    ],
    subject:
      "Synthetic Appointment Orders for Intentionally Wrapped Quality Assurance Review"
  })
);
await save(
  "two-page-memo.docx",
  baseSpec({
    suspense: "15 June 2026",
    paragraphs: Array.from({ length: 12 }, (_, index) => ({
      text: `${index + 1 === 1 ? "Purpose.  " : ""}Synthetic paragraph ${index + 1} documents a layout verification point.  It intentionally contains enough plain-language text to verify continuation-page headers, page numbering, spacing, and signature placement in a multi-page memorandum.`,
      children: []
    }))
  })
);
await save("mfr.docx", baseSpec({ type: "mfr", addressees: [] }));
await save(
  "counseling.docx",
  baseSpec({
    type: "counseling",
    addressees: [],
    subject: "Synthetic Developmental Counseling",
    acknowledgment: {
      statement: "I received and understand this synthetic counseling.",
      signers: [{ label: "RATED OFFICER" }, { label: "SENIOR RATER" }]
    }
  })
);
await save(
  "thru-memo.docx",
  baseSpec({ thru: ["Chief of Staff", "Commanding General"] })
);
await save(
  "distribution-memo.docx",
  baseSpec({
    addressees: [],
    distribution: ["Team Alpha", "Team Bravo", "Team Charlie"],
    cfRecipients: ["Synthetic records office"],
    enclosures: ["Synthetic workflow enclosure"]
  })
);

console.log(`Generated QA documents in ${outputDir.pathname}`);
