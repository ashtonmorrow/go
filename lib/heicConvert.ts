import { heicTo, isHeic } from "heic-to";

/**
 * If the file is HEIC/HEIF, convert it to JPEG. Otherwise return as-is.
 * Returns { file, wasConverted }.
 */
export async function convertHeicIfNeeded(file: File): Promise<{ file: File; wasConverted: boolean }> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const isHeicExt = ext === "heic" || ext === "heif";
  
  let needsConversion = isHeicExt;
  if (!needsConversion) {
    try {
      needsConversion = await isHeic(file);
    } catch {
      // If detection fails, fall back to extension check
    }
  }

  if (!needsConversion) {
    return { file, wasConverted: false };
  }

  const jpegBlob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.85 });
  const newName = file.name.replace(/\.heic$/i, ".jpg").replace(/\.heif$/i, ".jpg");
  const converted = new File([jpegBlob], newName, { type: "image/jpeg" });
  return { file: converted, wasConverted: true };
}
