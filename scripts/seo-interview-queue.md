# SEO-ranked interview queue

Generated 2026-05-21. Search volumes from Google Ads via DataForSEO,
location: United States, intent: "things to do in [city]" (the
highest-volume booking-intent query per CLAUDE.md).

## Scoring

`score = volume × material × content_gap × ship_gap`

- **volume**: monthly US searches for "things to do in [city]"
- **material**: `min(pin_count, 60) / 60` — how much lived experience Mike has to fuel the interview. Capped because past ~60 pins the marginal interview gain flattens.
- **content_gap**: `max(0, 1 - words/3500)` — how much the existing guide leaves on the table.
- **ship_gap**: 1.0 if `indexable: false`, 0.25 if already shipping. Indexable-false guides are entirely locked out of search.

## Top 30 interview targets

| Rank | Score | Vol | Pins | Words | Idx | Hero | Slug |
|---:|---:|---:|---:|---:|---|---|---|
|  1 | 30,298 | 74,000 |   5 |   631 | N | N | miami |
|  2 | 13,775 | 33,100 |  28 | 2,716 | N | N | tokyo |
|  3 | 13,550 | 27,100 | 160 | 4,098 | N | N | london |
|  4 | 13,158 | 22,200 | 186 | 2,851 | N | N | barcelona |
|  5 | 12,820 | 18,100 |  41 |   879 | N | N | lisbon |
|  6 | 12,273 | 27,100 |  22 | 1,887 | N | N | rome |
|  7 | 11,646 | 18,100 |  33 |   830 | N | N | panama |
|  8 | 10,315 | 27,100 |   7 | 1,331 | N | N | nyc |
|  9 |  8,960 | 22,200 |   8 | 1,114 | N | N | cdmx |
| 10 |  8,696 | 12,100 |  48 | 1,283 | N | Y | prague |
| 11 |  8,375 | 18,100 |  30 | 2,373 | N | N | athens |
| 12 |  6,573 | 12,100 |  22 |   867 | N | N | dublin |
| 13 |  6,125 |  9,900 |  32 |   985 | N | Y | berlin |
| 14 |  6,103 | 12,100 |  27 | 1,730 | N | Y | singapore |
| 15 |  5,393 |  8,100 |  60 | 2,339 | N | N | buenos-aires |
| 16 |  4,250 | 12,100 |  18 | 2,761 | N | N | munich |
| 17 |  4,144 |  8,100 |  18 |   825 | N | N | cartagena-colombia |
| 18 |  3,401 | 22,200 |  47 | 2,069 | Y | Y | madrid (already shipping) |
| 19 |  3,324 |  4,400 |  73 | 1,712 | N | N | ho-chi-minh-city |
| 20 |  3,216 |  8,100 |  11 | 1,550 | N | N | vienna |
| 21 |  3,190 |  6,600 |  15 |   848 | N | N | medellin |
| 22 |  3,148 | 22,200 |  44 | 2,273 | Y | N | amsterdam (already shipping) |
| 23 |  3,044 |  5,400 |  25 |   930 | N | N | bogota |
| 24 |  2,868 |  6,600 |   9 |   793 | N | N | lima |
| 25 |  2,835 |  8,100 |  30 | 3,620 | N | N | bali |
| 26 |  2,704 |  6,600 |   5 |   626 | N | Y | istanbul |
| 27 |  2,576 |  5,400 |  39 | 2,773 | N | N | malta |
| 28 |  2,402 |  3,600 |  49 | 1,752 | N | N | split |
| 29 |  2,101 |  4,400 |  15 |   922 | N | Y | dubrovnik |
| 30 |  2,095 |  5,400 |   5 |   964 | N | Y | taipei |

## Practical reading of the top of the list

**Highest-confidence next interviews** (volume + Mike clearly has rich material):

1. **Lisbon** (#5, 18,100/mo, 41 pins, 879w). The single best ratio. Big volume, thin guide, plenty of pins for the interview to draw from.
2. **Prague** (#10, 12,100/mo, 48 pins, 1,283w, hero already wired, 103 personal photos on disk). Highest pin-density evidence of multiple Prague trips.
3. **Barcelona** (#4, 22,200/mo, 186 pins, 2,851w). The highest-pin city in the atlas. Even an existing 2.8K-word guide leaves room because of Mike's volume of material.
4. **London** (#3, 27,100/mo, 160 pins, 4,098w). Already long but Mike's lived UK material is dense. A voice pass could refine, not rebuild.
5. **Buenos Aires** (#15, 8,100/mo, 60 pins, 2,339w). Solid material, mid-thick guide, room to bring Mike's voice in.

**High-volume but low-material caveats** (worth doing for volume, but the interview will yield thinner answers):

- Miami (#1) — 74K vol but only 5 pins. Mike's been briefly. Real upside if Mike has even 30 minutes of memory for it.
- NYC (#8), CDMX (#9), Istanbul (#26), Taipei (#30) — same shape.

**Where the interview moves the needle most per Mike-minute**:

The sweet spot is the top of the "high-confidence" list above, especially **Lisbon** and **Prague**. Both have substantial pin counts (indicating real material) and thin existing guides (indicating high lift). Each represents ~6,000–9,000 unique monthly searches that the atlas isn't currently competing for at all because `indexable: false`.

## Cities with no volume data

The DataForSEO query treated theme guides, route guides, and very small destinations as zero-volume. These remain on the queue at low priority:

- Theme: balkan-green-markets, gaudi, kusttram-stations, spa-day, alicante-metro-stops, bernina-express-route, penedes
- Small destinations: cabo-verde, krka, gunung-mulu, eger, ulm, durres, delft, frankfurt, lyon, malaga, rotterdam, the-hague, utrect-nl, venezia, milano

The-Hague at 3,119w is interesting — already substantial, low-mid volume. Worth a polish pass if Mike likes it.
