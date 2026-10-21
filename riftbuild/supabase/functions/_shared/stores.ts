// Persistence used by the AI function: response cache, daily quotas and the per-call log (spec §6.2).
export type CallLog = {
  kind: 'draft' | 'build_review' | 'meta_tips';
  subject_hash: string;
  model: string | null;
  patch: string | null;
  cache_hit: boolean;
  attempts: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number | null;
  cache_creation_tokens?: number | null;
  ttft_ms?: number | null;
  latency_ms: number;
  status: 'ok' | 'incomplete' | 'error' | 'rate_limited' | 'refused' | 'timeout';
  error_code?: string | null;
  removed_ids?: string[];
  prompt_version?: string | null;
};

export type CacheEntry = { response: unknown; model: string; created_at: string };

export interface Stores {
  cacheGet(key: string): Promise<CacheEntry | null>;
  cachePut(
    key: string,
    entry: {
      kind: string;
      patch: string;
      bundle_hash: string;
      model: string;
      prompt_version: string;
      response: unknown;
      ttlHours: number;
    },
  ): Promise<void>;
  consumeQuota(
    subject: string,
    kind: string,
    limit: number,
  ): Promise<{ allowed: boolean; used: number }>;
  logCall(call: CallLog): Promise<void>;
}

export function memoryStores(): Stores & {
  calls: CallLog[];
  cache: Map<string, CacheEntry & { expires: number }>;
  usage: Map<string, number>;
} {
  const cache = new Map<string, CacheEntry & { expires: number }>();
  const usage = new Map<string, number>();
  const calls: CallLog[] = [];
  return {
    calls,
    cache,
    usage,
    async cacheGet(key) {
      const hit = cache.get(key);
      return hit && hit.expires > Date.now() ? hit : null;
    },
    async cachePut(key, e) {
      cache.set(key, {
        response: e.response,
        model: e.model,
        created_at: new Date().toISOString(),
        expires: Date.now() + e.ttlHours * 3600_000,
      });
    },
    async consumeQuota(subject, kind, limit) {
      const k = `${subject}|${new Date().toISOString().slice(0, 10)}|${kind}`;
      const used = usage.get(k) ?? 0;
      if (used >= limit) return { allowed: false, used };
      usage.set(k, used + 1);
      return { allowed: true, used: used + 1 };
    },
    async logCall(call) {
      calls.push(call);
    },
  };
}

/** PostgREST-backed stores (service role; tables have RLS with no policies, see migrations). */
export function supabaseStores(
  url: string,
  serviceKey: string,
  fetchFn: typeof fetch = fetch,
): Stores {
  const base = `${url.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
  };
  return {
    async cacheGet(key) {
      const res = await fetchFn(
        `${base}/ai_cache?key=eq.${encodeURIComponent(key)}&expires_at=gt.${new Date().toISOString()}&select=response,model,created_at`,
        { headers },
      );
      if (!res.ok) return null;
      const rows = (await res.json()) as CacheEntry[];
      return rows[0] ?? null;
    },
    async cachePut(key, e) {
      await fetchFn(`${base}/ai_cache?on_conflict=key`, {
        method: 'POST',
        headers: { ...headers, prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          key,
          kind: e.kind,
          patch: e.patch,
          bundle_hash: e.bundle_hash,
          model: e.model,
          prompt_version: e.prompt_version,
          response: e.response,
          expires_at: new Date(Date.now() + e.ttlHours * 3600_000).toISOString(),
        }),
      });
    },
    async consumeQuota(subject, kind, limit) {
      const res = await fetchFn(`${base}/rpc/consume_ai_quota`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_subject: subject, p_kind: kind, p_limit: limit }),
      });
      if (!res.ok) throw new Error(`quota HTTP ${res.status}`);
      const rows = (await res.json()) as { allowed: boolean; used: number }[];
      return rows[0] ?? { allowed: false, used: limit };
    },
    async logCall(call) {
      await fetchFn(`${base}/ai_calls`, {
        method: 'POST',
        headers: { ...headers, prefer: 'return=minimal' },
        body: JSON.stringify(call),
      }).catch(() => {});
    },
  };
}
