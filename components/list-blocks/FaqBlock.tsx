import type { ListFaq } from '@/lib/content';

// Opt-in Q&A block. Frontmatter shape:
//   faqs:
//     - q: Why use the tram in Alicante?
//       a: The tram makes Alicante work as a coastal base…
//
// Pairs with faqJsonLd() in lib/seo to emit FAQPage structured data —
// that's the SEO surface that lands a list in Google's "People also ask"
// rich result on relevant queries.
export default function FaqBlock({ items }: { items: ListFaq[] }) {
  return (
    <section id="quick-answers" className="mt-8 max-w-prose">
      <h2 className="text-h2 text-ink-deep">Quick answers</h2>
      <dl className="mt-3 space-y-4">
        {items.map(faq => (
          <div key={faq.question}>
            <dt className="font-semibold text-ink-deep">{faq.question}</dt>
            <dd className="mt-1 text-prose leading-relaxed text-ink">
              {faq.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
