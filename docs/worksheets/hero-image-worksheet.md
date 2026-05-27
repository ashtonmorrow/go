# Hero-image worksheet

For each guide without `hero_image` set, lists candidate photo URLs from
`go_cities.hero_photo_urls`. Pick one in `/admin/lists/<slug>`; the picker
writes it back to the guide frontmatter. Choices flagged as `(Wikipedia
stock)` are the fallback `go_cities.hero_image` and should usually NOT be
used as the guide hero (that field is for personal photos).

## 4 guides with a Mike personal photo ready (the easy picks)

Convention used by tbilisi/bristol/madrid/bangkok is the first `/personal-photos/` URL.

| Guide | City | Featured? | First personal-photo URL |
|---|---|---|---|
| barcelona | barcelona | Y | https://pdjrvlhepiwkshxerkpz.supabase.co/storage/v1/object/public/personal-photos/d6/d6266558b760ddfa264fbb6036145a652f9a3aeec7c4300e68ea5d3c1d736685.jpg |
| bogota | bogota | Y | https://pdjrvlhepiwkshxerkpz.supabase.co/storage/v1/object/public/personal-photos/ac/ace8941024303ea5d242d071a75d878c8cbb26b3a16b6fac4406b9d9a36a689c.jpg |
| bucharest | bucharest | Y | https://pdjrvlhepiwkshxerkpz.supabase.co/storage/v1/object/public/personal-photos/d2/d2db50d1ab6b4f94d7dc243ae562d1c42f214a9753a97e93d25b2cdcb82df724.jpg |
| gaudi | barcelona | Y | https://pdjrvlhepiwkshxerkpz.supabase.co/storage/v1/object/public/personal-photos/d6/d6266558b760ddfa264fbb6036145a652f9a3aeec7c4300e68ea5d3c1d736685.jpg |

## 0 guides with a pin photo but no personal photo
Pin photos can work if the pin is iconic enough (e.g. a single landmark).

| Guide | City | First pin photo |
|---|---|---|

## 3 guides where the only candidate is an AI-generated poster
These need a real photo uploaded.

- **amsterdam** (amsterdam)
- **bar-montenegro** (bar-mne)
- **brighton** (brighton)

## 90 guides with only a Wikipedia stock fallback
These would render with go_cities.hero_image if left empty, which is the standard fallback.
A personal photo would be better, but the fallback is fine for now.

- **alicante-metro-stops** (alicante)
- **alicante** (alicante)
- **annecy** (annecy)
- **antwerp** (antwerp)
- **athens** (athens)
- **augsburg** (augsburg)
- **avila** (avila)
- **bath-uk** (bath)
- **belluno-caviola** (belluno)
- **boston** (boston)
- **brittany** (saint-malo)
- **bruges** (bruges)
- **budva** (budva)
- **buenos-aires** (buenos-aires)
- **cadaques** (cadaques)
- **cairo** (cairo)
- **cambridge** (cambridge)
- **cartagena-colombia** (cartagena)
- **cdmx** (mexico-city)
- **chiang-mai** (chiang-mai)
- **chur** (chur)
- **cologne** (cologne)
- **dublin** (dublin)
- **durres** (durres)
- **dusseldorf** (dusseldorf)
- **eastbourne** (eastbourne)
- **eger** (eger)
- **frankfurt** (frankfurt)
- **granada** (granada)
- **gunung-mulu** (gunung-mulu)
- **heidelberg** (heidelberg)
- **ho-chi-minh-city** (ho-chi-minh-city)
- **hoi-an** (hoi-an)
- **houston** (houston)
- **ipoh** (ipoh)
- **izmir** (izmir)
- **khao-yai** (khao-yai)
- **koh-samui** (ko-samui)
- **kota-kinabalu** (kota-kinabalu)
- **kotor** (kotor)
- **krabi** (krabi)
- **larnaca** (larnaca)
- **lima** (lima)
- **lisbon** (lisbon)
- **liverpool** (liverpool)
- **london** (london)
- **lpq** (luang-prabang)
- **lyon** (lyon)
- **malaga** (malaga)
- **malta** (valletta)
- **manchester** (manchester)
- **marrakech** (marrakesh)
- **medellin** (medellin)
- **miami** (miami)
- **milano** (milan)
- **montevideo** (montevideo)
- **mostar** (mostar)
- **munich** (munich)
- **muscat** (muscat)
- **nashville** (nashville)
- **nuremberg** (nuremberg)
- **nyc** (new-york-city)
- **pamukkale** (pamukkale)
- **phi-phi** (phi-phi)
- **phuket** (phuket)
- **playa-del-carmen** (playa-del-carmen)
- **rennes** (rennes)
- **rome** (rome)
- **saint-malo-mt-sant-michel** (saint-malo)
- **salisbury-stonehenge** (salisbury)
- **santiago-chile** (santiago)
- **santiago-de-compostela-es** (santiago-de-compostela)
- **sarajevo** (sarajevo)
- **seoul** (seoul)
- **sitges** (sitges)
- **sofia** (sofia)
- **split** (split)
- **são-paulo** (sao-paulo)
- **the-hague** (the-hague)
- **tirana** (tirana)
- **tokyo** (tokyo)
- **trogir** (trogir)
- **ulm** (ulm)
- **utrect-nl** (utrecht)
- **venezia** (venice)
- **venlo** (venlo)
- **vienna** (vienna)
- **york** (york)
- **zagreb** (zagreb)
- **zermatt** (zermatt)

## 20 guides with no candidates

These need a personal photo uploaded to `go_cities.hero_photo_urls` first.

- **bali** (no city): no related.city
- **balkan-green-markets** (no city): no related.city
- **benidorm** (no city): no related.city
- **bernina-express-route** (no city): no related.city
- **cabo-verde** (no city): no related.city
- **cardiff** (no city): no related.city
- **como-italy** (no city): no related.city
- **delft** (delft): no hero_photo_urls or hero_image on city
- **djerba** (no city): no related.city
- **jamaica** (no city): no related.city
- **krka** (no city): no related.city
- **kusttram-stations** (no city): no related.city
- **palma** (no city): no related.city
- **panama** (panama): no hero_photo_urls or hero_image on city
- **penedes** (no city): no related.city
- **rio** (rio): no hero_photo_urls or hero_image on city
- **saranda-ksamil** (no city): no related.city
- **spa-day** (no city): no related.city
- **tenerife** (tenerife): no hero_photo_urls or hero_image on city
- **verona** (no city): no related.city