import { SPEC_VERSION, type MemoSpec } from "../src/model/memoSpec";

export function createSyntheticSpec(overrides: Partial<MemoSpec> = {}): MemoSpec {
  return {
    specVersion: SPEC_VERSION,
    type: "memo",
    profileId: "test-profile",
    letterhead: {
      displayName: "Synthetic unit",
      orgLines: [
        "DEPARTMENT OF THE ARMY",
        "SYNTHETIC TEST UNIT",
        "100 EXAMPLE AVENUE",
        "FORT EXAMPLE, MISSOURI 60000"
      ],
      sealAssetPath: null,
      sealImageDataUrl: null,
      letterheadStyle: "army"
    },
    officeSymbol: "ABCD-EF",
    arimsRecordNumber: "25-50a",
    date: "1 June 2026",
    suspense: null,
    subject: "Clinic Workflow Update",
    addressees: ["All Section Leaders"],
    thru: [],
    font: "Arial",
    fontSizePt: 12,
    paragraphs: [
      {
        text: "Purpose.  This memorandum establishes a synthetic workflow update.",
        children: []
      },
      {
        text: "Leaders will review the workflow with their teams.",
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
