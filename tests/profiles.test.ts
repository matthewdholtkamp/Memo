import { describe, expect, it } from "vitest";
import { createDefaultSpec } from "../src/model/defaultSpec";
import { imageFileToDataUrl } from "../src/model/seals";
import {
  builtInProfiles,
  createCustomProfile,
  exportProfile,
  importProfile,
  refreshBuiltInProfileDefaults
} from "../src/model/profiles";

const SHARED_HOSPITAL_ADDRESS = [
  "GENERAL LEONARD WOOD COMMUNITY HOSPITAL",
  "4234 ILLINOIS AVE #351",
  "FORT LEONARD WOOD, MO 65473"
];

describe("profile helpers", () => {
  it("ships only the DHA and Army letterhead choices with the shared hospital address", () => {
    expect(builtInProfiles.map((profile) => profile.displayName)).toEqual(["DHA", "Army"]);
    expect(builtInProfiles.map((profile) => profile.id)).toEqual([
      "glwch-dha",
      "glwch-army"
    ]);
    expect(builtInProfiles[0]).toMatchObject({
      displayName: "DHA",
      sealAssetPath: "assets/seals/army-seal.png",
      letterheadStyle: "dha",
      defaultOfficeSymbol: "MCXP-CCS",
      orgLines: ["DEFENSE HEALTH AGENCY", ...SHARED_HOSPITAL_ADDRESS]
    });
    expect(builtInProfiles[1]).toMatchObject({
      displayName: "Army",
      sealAssetPath: "assets/seals/army-seal.png",
      letterheadStyle: "army",
      defaultOfficeSymbol: "MCXP-CCS",
      orgLines: ["DEPARTMENT OF THE ARMY", ...SHARED_HOSPITAL_ADDRESS]
    });
  });

  it("defaults new memos to DHA", () => {
    const spec = createDefaultSpec();
    expect(spec.profileId).toBe("glwch-dha");
    expect(spec.letterhead.displayName).toBe("DHA");
    expect(spec.letterhead.letterheadStyle).toBe("dha");
  });

  it("migrates old and unsupported profiles back to DHA", () => {
    const oldGlwachSpec = createDefaultSpec(builtInProfiles[1]);
    oldGlwachSpec.profileId = "glwach-dccs";
    oldGlwachSpec.officeSymbol = "MCXP-DCCS";
    const migrated = refreshBuiltInProfileDefaults(oldGlwachSpec);

    expect(migrated.profileId).toBe("glwch-dha");
    expect(migrated.officeSymbol).toBe("MCXP-CCS");
    expect(migrated.letterhead.orgLines).toEqual([
      "DEFENSE HEALTH AGENCY",
      ...SHARED_HOSPITAL_ADDRESS
    ]);

    const unsupportedSpec = createDefaultSpec(builtInProfiles[1]);
    unsupportedSpec.profileId = "generic-army";
    unsupportedSpec.officeSymbol = "MCXP-CUSTOM";
    const fallback = refreshBuiltInProfileDefaults(unsupportedSpec);

    expect(fallback.profileId).toBe("glwch-dha");
    expect(fallback.officeSymbol).toBe("MCXP-CUSTOM");
  });

  it("round-trips imported profile JSON", () => {
    const profile = createCustomProfile();
    profile.displayName = "Synthetic profile";
    expect(importProfile(exportProfile(profile))).toEqual(profile);
  });

  it("rejects unsupported seal file types", async () => {
    const file = new File(["not an image"], "seal.svg", {
      type: "image/svg+xml"
    });
    await expect(imageFileToDataUrl(file)).rejects.toThrow(
      "Seal images must be PNG or JPEG files."
    );
  });

  it("rejects seal images larger than 2 MB", async () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "seal.png", {
      type: "image/png"
    });
    await expect(imageFileToDataUrl(file)).rejects.toThrow(
      "Seal images must be 2 MB or smaller."
    );
  });
});
