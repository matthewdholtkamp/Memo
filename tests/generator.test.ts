import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildDocx } from "../src/generator/buildDocx";
import { createSyntheticSpec } from "./fixtures";

const sealImageDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function docxXml(spec = createSyntheticSpec()) {
  const archive = unzipSync(new Uint8Array(await (await buildDocx(spec)).arrayBuffer()));
  const text = (path: string) => strFromU8(archive[path]);
  const headers = Object.keys(archive)
    .filter((path) => /^word\/header\d+\.xml$/.test(path))
    .map(text);
  const footerName = Object.keys(archive).find((path) => /^word\/footer\d+\.xml$/.test(path));
  return {
    document: text("word/document.xml"),
    firstHeader: headers.find((header) => header.includes("DEPARTMENT OF THE ARMY")) ?? "",
    header: headers.find((header) => header.includes("SUBJECT:")) ?? "",
    footer: footerName ? text(footerName) : ""
  };
}

function countEmptyParagraphsBetween(xml: string, start: string, end: string): number {
  const startIndex = xml.indexOf(start);
  const endIndex = xml.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return (
    xml
      .slice(startIndex + start.length, endIndex)
      .match(/<w:p><w:pPr>[^]*?<\/w:pPr><\/w:p>/g) ?? []
  ).length;
}

describe("buildDocx", () => {
  it("generates page settings, ARIMS metadata, numbering, indentation, subject spacing, and uppercase signature", async () => {
    const xml = await docxXml();
    expect(xml.document).toContain('w:w="12240"');
    expect(xml.document).toContain('w:h="15840"');
    expect(xml.document).toContain("ABCD-EF (25-50a)");
    expect(xml.document).toContain("SUBJECT:  Clinic Workflow Update");
    expect(xml.document).toContain("1.  Purpose.");
    expect(xml.document).toContain("a.  Teams will identify");
    expect(xml.document).toContain('w:firstLine="360"');
    expect(xml.document).toContain('w:left="0"');
    expect(xml.document).toContain('w:left="4680"');
    expect(xml.document).toContain('<w:jc w:val="right"/>');
    expect(xml.document).toContain("JORDAN A. RIVERA");
    expect(xml.document).toContain("<w:titlePg/>");
  });

  it("automatically numbers a single-paragraph memorandum", async () => {
    const spec = createSyntheticSpec({
      paragraphs: [{ text: "Purpose.  This is a single paragraph memorandum.", children: [] }]
    });
    const xml = await docxXml(spec);
    expect(xml.document).toContain("1.  Purpose.  This is a single paragraph memorandum.");
  });

  it("keeps one blank paragraph before the subject and two before the body", async () => {
    const addressee =
      "Synthetic Appointment Recipient, Deputy Director for an Intentionally Long Quality Assurance Organization";
    const subject =
      "Synthetic Appointment Orders for Intentionally Wrapped Quality Assurance Review";
    const xml = await docxXml(
      createSyntheticSpec({
        addressees: [addressee],
        subject
      })
    );
    expect(
      countEmptyParagraphsBetween(
        xml.document,
        `MEMORANDUM FOR ${addressee}`,
        `SUBJECT:  ${subject}`
      )
    ).toBe(1);
    expect(
      countEmptyParagraphsBetween(
        xml.document,
        `SUBJECT:  ${subject}`,
        "1.  Purpose."
      )
    ).toBe(2);
  });

  it("outdents the seal while centering letterhead text on the physical page", async () => {
    const spec = createSyntheticSpec();
    const xml = await docxXml({
      ...spec,
      letterhead: { ...spec.letterhead, sealImageDataUrl }
    });
    expect(xml.firstHeader).toContain(
      '<wp:positionH relativeFrom="page"><wp:posOffset>457200</wp:posOffset></wp:positionH>'
    );
    expect(xml.firstHeader).toContain(
      '<wp:positionV relativeFrom="page"><wp:posOffset>457200</wp:posOffset></wp:positionV>'
    );
    expect(xml.firstHeader).toContain('<wp:extent cx="914400" cy="914400"/>');
    expect(xml.firstHeader).toMatch(
      /<w:jc w:val="center"\/>[^]*?<w:b\/>[^]*?<w:sz w:val="20"\/>[^]*?DEPARTMENT OF THE ARMY/
    );
    expect(xml.document).not.toContain("FORT EXAMPLE, MISSOURI 60000");
    expect(
      countEmptyParagraphsBetween(
        xml.document,
        "<w:body>",
        "ABCD-EF (25-50a)"
      )
    ).toBe(3);
  });

  it("renders suspense dates in bold and post-closing lists", async () => {
    const xml = await docxXml(
      createSyntheticSpec({
        suspense: "10 June 2026",
        enclosures: ["Synthetic enclosure"],
        cfRecipients: ["Synthetic recipient"],
        distribution: ["Team Alpha", "Team Bravo"]
      })
    );
    expect(xml.document).toContain("S: 10 June 2026");
    expect(xml.document).toMatch(/<w:b\/>[^]*S: 10 June 2026/);
    expect(xml.document).toContain("Encl");
    expect(xml.document).toContain("CF:");
    expect(xml.document).toContain("DISTRIBUTION:");
    expect(xml.document).toContain("MEMORANDUM FOR SEE DISTRIBUTION");
  });

  it("includes continuation-page office symbol, subject, and page number", async () => {
    const xml = await docxXml();
    expect(xml.header).toContain("ABCD-EF (25-50a)");
    expect(xml.header).toContain("SUBJECT:  Clinic Workflow Update");
    expect(xml.footer).toContain("PAGE");
  });

  it("renders THRU routing and counseling acknowledgment", async () => {
    const xml = await docxXml(
      createSyntheticSpec({
        type: "counseling",
        thru: ["Chief of Staff", "Commanding General"],
        acknowledgment: {
          statement: "I received and understand this synthetic counseling.",
          signers: [{ label: "RATED OFFICER" }, { label: "SENIOR RATER" }]
        }
      })
    );
    expect(xml.document).toContain("MEMORANDUM THRU Chief of Staff");
    expect(xml.document).toContain("THRU Commanding General");
    expect(xml.document).toContain("MEMORANDUM FOR RECORD");
    expect(xml.document).toContain("ACKNOWLEDGMENT");
  });
});
