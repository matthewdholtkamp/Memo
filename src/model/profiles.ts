import { z } from "zod";
import {
  fontSchema,
  letterheadSnapshotSchema,
  letterheadStyleSchema,
  signerPresetSchema,
  type LetterheadSnapshot,
  type LetterheadStyle,
  type MemoFont,
  type MemoSpec,
  type SignerPreset
} from "./memoSpec";

export const profileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  orgLines: z.array(z.string()).min(1),
  sealAssetPath: z.string().nullable(),
  sealImageDataUrl: z.string().nullable(),
  letterheadStyle: letterheadStyleSchema.default("dha"),
  defaultOfficeSymbol: z.string(),
  defaultFont: fontSchema,
  signerPresets: z.array(signerPresetSchema)
});

export type LetterheadProfile = {
  id: string;
  displayName: string;
  orgLines: string[];
  sealAssetPath: string | null;
  sealImageDataUrl: string | null;
  letterheadStyle: LetterheadStyle;
  defaultOfficeSymbol: string;
  defaultFont: MemoFont;
  signerPresets: SignerPreset[];
};

const GLWCH_ADDRESS_LINES = [
  "GENERAL LEONARD WOOD COMMUNITY HOSPITAL",
  "4234 ILLINOIS AVE #351",
  "FORT LEONARD WOOD, MO 65473"
];

export const builtInProfiles: LetterheadProfile[] = [
  {
    id: "glwch-dha",
    displayName: "DHA",
    orgLines: ["DEFENSE HEALTH AGENCY", ...GLWCH_ADDRESS_LINES],
    sealAssetPath: "assets/seals/army-seal.png",
    sealImageDataUrl: null,
    letterheadStyle: "dha",
    defaultOfficeSymbol: "MCXP-CCS",
    defaultFont: "Arial",
    signerPresets: []
  },
  {
    id: "glwch-army",
    displayName: "Army",
    orgLines: ["DEPARTMENT OF THE ARMY", ...GLWCH_ADDRESS_LINES],
    sealAssetPath: "assets/seals/army-seal.png",
    sealImageDataUrl: null,
    letterheadStyle: "army",
    defaultOfficeSymbol: "MCXP-CCS",
    defaultFont: "Arial",
    signerPresets: []
  }
];

export function profileToSnapshot(profile: LetterheadProfile): LetterheadSnapshot {
  return letterheadSnapshotSchema.parse({
    displayName: profile.displayName,
    orgLines: profile.orgLines,
    sealAssetPath: profile.sealAssetPath,
    sealImageDataUrl: profile.sealImageDataUrl,
    letterheadStyle: profile.letterheadStyle
  });
}

export function refreshBuiltInProfileDefaults(spec: MemoSpec): MemoSpec {
  const profile =
    builtInProfiles.find(({ id }) => id === spec.profileId) ?? builtInProfiles[0];
  const officeSymbolNeedsDefault =
    !spec.officeSymbol.trim() ||
    spec.officeSymbol === "[OFFICE SYMBOL]" ||
    (spec.profileId === "glwach-dccs" && spec.officeSymbol === "MCXP-DCCS");
  const officeSymbol =
    officeSymbolNeedsDefault
      ? profile.defaultOfficeSymbol
      : spec.officeSymbol;
  return {
    ...spec,
    profileId: profile.id,
    letterhead: profileToSnapshot(profile),
    officeSymbol,
    font: profile.defaultFont
  };
}

export function exportProfile(profile: LetterheadProfile): string {
  return JSON.stringify(profile, null, 2);
}

export function importProfile(json: string): LetterheadProfile {
  return profileSchema.parse(JSON.parse(json));
}

export function createCustomProfile(): LetterheadProfile {
  return {
    id: `custom-${crypto.randomUUID()}`,
    displayName: "Custom profile",
    orgLines: ["DEPARTMENT OF THE ARMY", "[UNIT OR ORGANIZATION]", "[ADDRESS]"],
    sealAssetPath: null,
    sealImageDataUrl: null,
    letterheadStyle: "dha",
    defaultOfficeSymbol: "",
    defaultFont: "Arial",
    signerPresets: []
  };
}
