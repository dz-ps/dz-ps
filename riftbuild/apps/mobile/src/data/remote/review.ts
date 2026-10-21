import {
  AiBuildReview,
  canAddItem,
  emptyBuild,
  type CatalogIndex,
  type UserBuild,
} from '@riftbuild/shared';
import { env } from '@/lib/env';
import { accessToken } from './supabase';

export type ReviewResult = { ok: true; review: AiBuildReview } | { ok: false; message: string };

/** /ai/build-review; swaps are re-checked on the device with the build creator's own rules. */
export async function requestBuildReview(
  build: UserBuild,
  index: CatalogIndex,
  style: string[],
  fetchFn: typeof fetch = (i, o) => fetch(i, o),
): Promise<ReviewResult> {
  if (!env.supabaseUrl || !build.championId)
    return { ok: false, message: 'A análise com IA precisa do backend configurado.' };
  try {
    const token = await accessToken();
    const items = build.items.filter((i): i is string => !!i);
    const res = await fetchFn(
      `${env.supabaseUrl.replace(/\/$/, '')}/functions/v1/ai/build-review`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(env.supabaseAnonKey ? { apikey: env.supabaseAnonKey } : {}),
        },
        body: JSON.stringify({
          patch: index.patch,
          champion_id: build.championId,
          role: build.role,
          items,
          style,
        }),
      },
    );
    const body = (await res.json()) as { review?: unknown; error?: { message_pt: string } };
    const parsed = AiBuildReview.safeParse(body.review);
    if (!res.ok || !parsed.success)
      return { ok: false, message: body.error?.message_pt ?? 'A análise com IA falhou.' };
    const swaps = parsed.data.swaps.filter((s) => {
      if (!items.includes(s.remove) || !index.items.has(s.add)) return false;
      const rest = emptyBuild(index.rules.item_slots);
      items.filter((i) => i !== s.remove).forEach((id, n) => (rest.items[n] = id));
      return canAddItem(rest, s.add, index).ok;
    });
    return { ok: true, review: { ...parsed.data, swaps } };
  } catch {
    return { ok: false, message: 'A análise com IA precisa de internet.' };
  }
}
