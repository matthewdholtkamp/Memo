import type { MemoSpec } from "./memoSpec";

const MAX_SEAL_BYTES = 2 * 1024 * 1024;
const ALLOWED_SEAL_TYPES = new Set(["image/png", "image/jpeg"]);

export async function imageFileToDataUrl(file: File): Promise<string> {
  if (!ALLOWED_SEAL_TYPES.has(file.type)) {
    throw new Error("Seal images must be PNG or JPEG files.");
  }
  if (file.size > MAX_SEAL_BYTES) {
    throw new Error("Seal images must be 2 MB or smaller.");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the seal image."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the bundled seal image."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export async function materializeBundledSeal(spec: MemoSpec): Promise<MemoSpec> {
  if (spec.letterhead.sealImageDataUrl || !spec.letterhead.sealAssetPath) {
    return spec;
  }
  if (spec.letterhead.sealAssetPath.endsWith(".svg")) {
    return spec;
  }
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);
  const assetUrl = new URL(spec.letterhead.sealAssetPath, baseUrl);
  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error("Could not load the bundled seal image.");
  }
  const sealImageDataUrl = await blobToDataUrl(await response.blob());
  return {
    ...spec,
    letterhead: { ...spec.letterhead, sealImageDataUrl }
  };
}
