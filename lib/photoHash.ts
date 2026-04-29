/**
 * SHA-256 hash of a file's bytes, computed in the browser via SubtleCrypto.
 *
 * Used as the primary upload-time dedup signal. Two files with the same hash
 * are byte-identical, full stop. This catches:
 *   - The same photo uploaded twice by the same user (double-tap on submit)
 *   - A user re-uploading from a synced device (iCloud Photos, AirDrop)
 *   - Two users sharing the same image file (rare but happens)
 *
 * Cost: ~30-80ms for a typical 4MB JPEG on a recent laptop. Cheap enough to
 * run on every upload before hitting Supabase.
 *
 * It does NOT catch the case of "same scene, different bytes" (e.g. one
 * photo went through WhatsApp compression). That's what the EXIF time/GPS
 * pair check covers as a second layer.
 */
export async function sha256OfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
