// === videoPoster ===========================================================
// Shared client-side poster-frame capture for the two upload paths:
// uploadEntityPhoto (per-entity HeroPicker / EntityCoverPickerModal)
// and UploadClient (the bulk drop-zone at /admin/upload).
//
// Both want the same thing: feed a video File into a hidden <video>,
// seek to a sensible "first interesting frame" point, draw to a
// <canvas>, export JPEG. The shared helper keeps both paths in sync
// (matching seek logic, JPEG quality, intrinsic-dim handling) and
// avoids re-implementing the canvas dance in two places.
//
// Returns null on any failure — caller should treat that as a non-fatal
// upload (the video itself still uploads; the personal_photos row gets
// poster_url=null and the renderer falls back to drawing the first
// frame via <video preload="metadata">).

export type VideoPoster = {
  posterBlob: Blob;
  /** Intrinsic pixel dimensions of the source video (= the canvas the
   *  poster was drawn from). Same fields the image path stores so the
   *  detail-page layout can reserve aspect-correct space. */
  width: number;
  height: number;
  /** Whole seconds, rounded. Useful as a "0:42" badge later. */
  durationSeconds: number;
};

/** Detect a video File by MIME type or filename extension. The atlas
 *  accepts mp4, mov, webm, and m4v end-to-end. */
export function isVideoFile(file: File): boolean {
  if (file.type && file.type.startsWith('video/')) return true;
  return /\.(mp4|mov|webm|m4v)$/i.test(file.name);
}

/** Capture a poster frame from a video file. Loads the video into a
 *  hidden <video>, seeks to ~0.5s (or 10% of duration if shorter),
 *  draws to a canvas, exports as JPEG. */
export async function videoPosterFromFile(file: File): Promise<VideoPoster | null> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const objectUrl = URL.createObjectURL(file);
    let settled = false;
    const finish = (result: VideoPoster | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };
    video.onloadedmetadata = () => {
      const dur = Number.isFinite(video.duration) ? video.duration : 0;
      // Seek to 0.5s when the clip is long enough; otherwise 10% in so
      // we don't land on a black opening frame.
      const seekTo = dur > 1 ? 0.5 : Math.max(0, dur * 0.1);
      try {
        video.currentTime = seekTo;
      } catch {
        finish(null);
      }
    };
    video.onseeked = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
          finish(null);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          blob => {
            if (!blob) {
              finish(null);
              return;
            }
            finish({
              posterBlob: blob,
              width: w,
              height: h,
              durationSeconds: Math.round(video.duration || 0),
            });
          },
          'image/jpeg',
          0.85,
        );
      } catch {
        finish(null);
      }
    };
    video.onerror = () => finish(null);
    video.src = objectUrl;
  });
}
