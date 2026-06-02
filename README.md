# ArmyMemo

ArmyMemo is a local-first React PWA that formats user-supplied text into unsigned `.docx` Army
memorandum drafts. Memo content stays in the browser. There is no backend, telemetry, account system,
or AI writing service.

## Local Development

```bash
npm install
npm test
npm run build
npm run dev
```

The Vite production base is `/Memo/` for GitHub project Pages.

## Supported Formats

- Standard memorandum and memorandum for record
- Counseling memorandum with acknowledgment block
- THRU routing, suspense dates, enclosures, CF recipients, and SEE DISTRIBUTION
- Recursive AR 25-50 paragraph numbering with block-style indentation
- First-page letterhead, continuation headers, and continuation-page numbers
- Optional ARIMS record-number entry that is placed after the office symbol when supplied

The app prepares unsigned Word documents. Use the built-in CAC signing guide for the Adobe handoff.
ArmyMemo warns when ARIMS is blank but permits export so a draft can proceed while the applicable
ARIMS/RRS-A number is being confirmed.

## Privacy

Draft autosave uses browser `localStorage` on the current device. JSON export and import are available
for deliberate draft transfer. Uploaded seals remain local data URLs. The production CSP forbids
external runtime connections.

## Profiles

Profiles define organization lines, a default office symbol, font preference, optional authorized seal,
and optional signer presets. Use **New custom** to prepare a local profile or import/export profile JSON.

## Manual Word QA

Before release, open representative generated files in Microsoft Word and verify:

1. Page 1 uses letterhead and has no page number.
2. Continuation pages show the office symbol, supplied ARIMS record number, subject, and centered page number.
3. Subparagraph runover lines return to the left margin.
4. Suspense dates are bold and flush right.
5. The signature block begins at page center and remains unsigned until the approved CAC workflow.

## Official Marks

See [NOTICE.md](NOTICE.md). The GLWCH profile includes a Department of Defense seal for authorized
government official-use letterhead. The generic profile remains neutral, and authorized users may
upload another approved local seal without transmitting it to a backend.
