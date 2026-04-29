import UploadClient from './UploadClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function AdminUploadPage() {
  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <h1 className="text-h2 text-ink-deep mb-2">Upload photos</h1>
      <p className="text-small text-muted mb-6 max-w-2xl leading-relaxed">
        Drop photos with EXIF GPS. We&rsquo;ll find nearby places via Google,
        propose pins to create, and let you assign each photo before saving.
        Existing pins within 100m are detected so you don&rsquo;t create
        duplicates.
      </p>
      <UploadClient />
    </div>
  );
}
