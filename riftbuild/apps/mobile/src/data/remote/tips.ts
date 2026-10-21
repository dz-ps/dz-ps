import {
  tipsCacheKey,
  validateTips,
  type AiMetaTips,
  type CatalogIndex,
  type Role,
} from '@riftbuild/shared';
import { env } from '@/lib/env';
import { prefs } from '@/lib/storage';

/**
 * "Campeões em alta" tips (spec §5.3). Generated server-side once per patch; the app only reads them,
 * re-validates every champion id against its own catalog and keeps a local copy per patch for offline use.
 */
export async function fetchMetaTips(
  role: Role,
  index: CatalogIndex,
  fetchFn: typeof fetch = (i, o) => fetch(i, o),
): Promise<AiMetaTips | null> {
  const key = tipsCacheKey(index.patch, role);
  const local = prefs.getJSON<unknown>(key);
  if (local) return validateTips(local, { index, role, requirePatch: true });
  if (!env.supabaseUrl) return null;
  try {
    const res = await fetchFn(
      `${env.supabaseUrl.replace(/\/$/, '')}/functions/v1/ai/meta-tips?role=${role}`,
      { headers: env.supabaseAnonKey ? { apikey: env.supabaseAnonKey } : {} },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { available?: boolean; tips?: unknown };
    if (!body.available) return null;
    const tips = validateTips(body.tips, { index, role, requirePatch: true });
    if (tips?.tips.length) prefs.setJSON(key, tips);
    return tips;
  } catch {
    return null;
  }
}
