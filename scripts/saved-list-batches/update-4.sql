WITH input(norm_name, list_arr, display_name, note) AS (VALUES
  ('payidar galata', ARRAY['istanbul']::text[], 'Payidar Galata', ''),('corner irish pub', ARRAY['istanbul']::text[], 'Corner Irish Pub', ''),('artist s', ARRAY['istanbul']::text[], 'Artist''s', ''),('murat kelle paca', ARRAY['istanbul']::text[], 'Murat Kelle Paça', ''),('n evet istanbul rooftop restaurant roof bar', ARRAY['istanbul']::text[], 'N''EVET İstanbul Rooftop Restaurant & Roof Bar', ''),('durumce taksim', ARRAY['istanbul']::text[], 'Dürümce Taksim', ''),('galata sanat restaurant galata koprusu', ARRAY['istanbul']::text[], 'Galata Sanat Restaurant Galata Köprüsü', ''),('porcini food', ARRAY['istanbul']::text[], 'Porcini Food', ''),('vento romano', ARRAY['istanbul']::text[], 'Vento Romano', ''),('pandeli restaurant', ARRAY['istanbul']::text[], 'Pandeli Restaurant', ''),('karakoy gulluoglu yonetim binas', ARRAY['istanbul']::text[], 'Karaköy Güllüoğlu Yönetim Binası', ''),('k z lkayalar taksim', ARRAY['istanbul']::text[], 'Kızılkayalar Taksim', ''),('durumzade', ARRAY['istanbul']::text[], 'Dürümzade', ''),('intercontinental istanbul', ARRAY['istanbul']::text[], 'InterContinental Istanbul', ''),('massa bistro', ARRAY['istanbul']::text[], 'Massa Bistro', ''),('pleasure terrace roof restaurant', ARRAY['istanbul']::text[], 'Pleasure Terrace Roof Restaurant', ''),('travertines of pamukkale', ARRAY['pamukkale']::text[], 'Travertines of Pamukkale', ''),('white house restaurant bar', ARRAY['pamukkale']::text[], 'White House Restaurant & Bar', ''),('mehmets heaven', ARRAY['pamukkale']::text[], 'Mehmets Heaven', ''),('porgy s seafood market', ARRAY['nola']::text[], 'Porgy’s Seafood Market', ''),('el pebre', ARRAY['random']::text[], 'El Pebre', ''),('ruines d empuries museu arqueologic', ARRAY['random']::text[], 'Ruïnes d''Empúries - Museu Arqueològic', ''),('otagi nenbutsuji temple', ARRAY['random']::text[], 'Otagi Nenbutsuji Temple', '')
),
unioned AS (
  SELECT p.id AS pin_id, array_agg(DISTINCT l) AS new_lists,
         max(NULLIF(i.note, '')) FILTER (WHERE i.note <> '') AS first_note
  FROM input i
  JOIN pins p ON p.norm_name = i.norm_name
  CROSS JOIN LATERAL unnest(i.list_arr) AS l
  GROUP BY p.id
)
UPDATE pins p
SET saved_lists = (
      SELECT array_agg(DISTINCT x ORDER BY x)
      FROM unnest(p.saved_lists || u.new_lists) AS x
    ),
    personal_notes = COALESCE(NULLIF(p.personal_notes, ''), u.first_note),
    updated_at = now()
FROM unioned u
WHERE p.id = u.pin_id;