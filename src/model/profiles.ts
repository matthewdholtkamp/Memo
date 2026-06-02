import { z } from "zod";
import {
  fontSchema,
  letterheadSnapshotSchema,
  signerPresetSchema,
  type LetterheadSnapshot,
  type MemoFont,
  type SignerPreset
} from "./memoSpec";

export const profileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  orgLines: z.array(z.string()).min(1),
  sealAssetPath: z.string().nullable(),
  sealImageDataUrl: z.string().nullable(),
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
  defaultOfficeSymbol: string;
  defaultFont: MemoFont;
  signerPresets: SignerPreset[];
};

export const builtInProfiles: LetterheadProfile[] = [
  {
    id: "glwach-dccs",
    displayName: "GLWCH / DCCS",
    orgLines: [
      "DEPARTMENT OF THE ARMY",
      "GENERAL LEONARD WOOD COMMUNITY HOSPITAL",
      "4234 ILLINOIS AVE #351",
      "FORT LEONARD WOOD, MO 65473"
    ],
    sealAssetPath: "assets/seals/dod-seal.png",
    sealImageDataUrl: null,
    defaultOfficeSymbol: "MCXP-DCCS",
    defaultFont: "Arial",
    signerPresets: []
  },
  {
    id: "generic-army",
    displayName: "Generic Army unit",
    orgLines: [
      "DEPARTMENT OF THE ARMY",
      "[UNIT OR ORGANIZATION]",
      "[STREET ADDRESS]",
      "[CITY, STATE ZIP]"
    ],
    sealAssetPath: "assets/seals/placeholder.svg",
    sealImageDataUrl: null,
    defaultOfficeSymbol: "[OFFICE SYMBOL]",
    defaultFont: "Arial",
    signerPresets: []
  }
];

export function profileToSnapshot(profile: LetterheadProfile): LetterheadSnapshot {
  return letterheadSnapshotSchema.parse({
    displayName: profile.displayName,
    orgLines: profile.orgLines,
    sealAssetPath: profile.sealAssetPath,
    sealImageDataUrl: profile.sealImageDataUrl
  });
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
    defaultOfficeSymbol: "",
    defaultFont: "Arial",
    signerPresets: []
  };
}
