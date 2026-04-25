// Renders a single JSON-LD <script> tag. Server component so the schema
// ships in the initial HTML for crawlers (rather than being attached at
// hydration time).
//
// Usage:
//   <JsonLd data={cityJsonLd(city, country)} />
//
// Pages that need multiple schema blocks (e.g. detail pages with both a
// City type and a BreadcrumbList) just render <JsonLd> twice.
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify is safe here — no user-supplied content can break
      // out of the script tag because we control the schema shape.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
