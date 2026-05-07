import type { ListGuideCards } from '@/lib/content';

// Opt-in "How I would use this" block. Frontmatter shape:
//   guide_cards:
//     title: How I would use the Alicante tram
//     intro: One paragraph framing the cards below.
//     cards:
//       - title: Best first ride
//         body: Ride north from the center toward El Campello…
//
// Title + intro are optional. Cards render in a two-column grid on
// sm+ viewports, single-column on mobile.
export default function GuideCardsBlock({ data }: { data: ListGuideCards }) {
  return (
    <section className="mt-8">
      {data.title && (
        <h2 className="text-h2 text-ink-deep">{data.title}</h2>
      )}
      {data.intro && (
        <p className="mt-3 text-prose leading-relaxed text-ink max-w-prose">
          {data.intro}
        </p>
      )}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {data.cards.map(card => (
          <div
            key={card.title}
            className="rounded border border-sand bg-white p-4"
          >
            <h3 className="text-h3 text-ink-deep">{card.title}</h3>
            <p className="mt-2 text-body leading-relaxed text-slate">
              {card.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
