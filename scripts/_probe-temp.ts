import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY!, {auth:{persistSession:false,autoRefreshToken:false}});

async function probe(label: string, name: string) {
  const { count } = await sb.from('pins').select('id', { count: 'exact', head: true }).contains('saved_lists', [name]);
  const { data: meta } = await sb.from('saved_lists').select('name, slug, cover_image_url, cover_pin_id, cover_photo_id, pin_order').eq('name', name).maybeSingle();
  console.log(`${label} name=\`${name}\`  pins=${count}  meta=${meta ? JSON.stringify(meta) : 'null'}`);
}

async function main() {
  await probe('A', 'hcmc');
  await probe('B', 'ho chi minh city');
  await probe('C', 'den haag');
  await probe('D', 'the hague');
  await probe('E', 'Den Haag');
  await probe('F', 'HCMC');

  // All saved_lists rows matching pattern
  const { data: lists } = await sb.from('saved_lists').select('name, slug');
  const filtered = (lists ?? []).filter((r: any) => /hcmc|hague|haag|saigon|ho chi/i.test(r.name));
  console.log('matching saved_lists rows:', filtered);

  // Sample any pin where saved_lists has any list name with HCMC/Saigon/Haag etc.
  const { data: pinSample } = await sb.from('pins').select('slug, saved_lists').not('saved_lists', 'is', null);
  const interesting = (pinSample ?? []).filter((p: any) => (p.saved_lists ?? []).some((l: string) => /hcmc|hague|haag|saigon|ho chi/i.test(l)));
  console.log(`pins with hcmc/hague/haag/saigon in saved_lists: ${interesting.length}`);
  if (interesting.length > 0) {
    const tally: Record<string, number> = {};
    for (const p of interesting) {
      for (const l of (p.saved_lists as string[])) {
        if (/hcmc|hague|haag|saigon|ho chi/i.test(l)) tally[l] = (tally[l] ?? 0) + 1;
      }
    }
    console.log('tally by exact list value:', tally);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
