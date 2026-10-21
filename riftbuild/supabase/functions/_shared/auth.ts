// Who is calling: a Supabase user (anonymous sign-in counts, D10) or, if enabled, a hashed device id.
export type Subject = { id: string; hash: string };

const tokenCache = new Map<string, { sub: string; at: number }>();

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export type AuthOptions = {
  supabaseUrl: string;
  serviceKey: string;
  salt: string;
  allowDeviceFallback: boolean;
  fetchFn?: typeof fetch;
};

export async function resolveSubject(req: Request, opts: AuthOptions): Promise<Subject | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token && token.split('.').length === 3) {
    const cached = tokenCache.get(token);
    let sub = cached && Date.now() - cached.at < 10 * 60_000 ? cached.sub : null;
    if (!sub) {
      const res = await fetchFn(`${opts.supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
        headers: { authorization: `Bearer ${token}`, apikey: opts.serviceKey },
      });
      if (res.ok) {
        sub = ((await res.json()) as { id?: string }).id ?? null;
        if (sub) tokenCache.set(token, { sub, at: Date.now() });
      }
    }
    if (sub) return { id: `u:${sub}`, hash: await sha256(`${opts.salt}:u:${sub}`) };
  }
  const device = req.headers.get('x-device-id');
  if (opts.allowDeviceFallback && device && /^[A-Za-z0-9-]{16,64}$/.test(device)) {
    const hash = await sha256(`${opts.salt}:d:${device}`);
    return { id: `d:${hash}`, hash };
  }
  return null;
}
