import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { prefs } from '@/lib/storage';

let client: SupabaseClient | null = null;

/** Supabase client with the session kept in MMKV. Created lazily: startup never waits on it (D10). */
export function supabase(): SupabaseClient | null {
  if (!env.hasBackend) return null;
  client ??= createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    auth: {
      storage: {
        getItem: async (k) => prefs.getString(k) ?? null,
        setItem: async (k, v) => prefs.setString(k, v),
        removeItem: async (k) => prefs.delete(k),
      },
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** Access token for AI calls: signs in anonymously on first use (no personal data). */
export async function accessToken(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.access_token;
  const { data: signed, error } = await sb.auth.signInAnonymously();
  if (error) throw new Error('Não foi possível iniciar a sessão anônima.');
  return signed.session?.access_token ?? null;
}
