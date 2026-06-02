import { describe, expect, it } from "vitest";
import { imageFileToDataUrl } from "../src/model/seals";
import {
  builtInProfiles,
  createCustomProfile,
  exportProfile,
  importProfile
} from "../src/model/profiles";

describe("profile helpers", () => {
  it("ships the current GLWCH DCCS letterhead profile", () => {
    expect(builtInProfiles[0]).toMatchObject({
      displayName: "GLWCH / DCCS",
      sealAssetPath: "assets/seals/dod-seal.png",
      orgLines: [
        "DEPARTMENT OF THE ARMY",
        "GENERAL LEONARD WOOD COMMUNITY HOSPITAL",
        "4234 ILLINOIS AVE #351",
        "FORT LEONARD WOOD, MO 65473"
      ]
    });
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
