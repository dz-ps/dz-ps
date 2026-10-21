import { supabase } from './supabase';

export type RemoteDeletion = 'deleted' | 'none' | 'failed';

/**
 * Deletes what the server holds for this device's anonymous session (profile, shared builds, quota rows)
 * via the delete_my_data RPC, then signs out. 'none' when there is no backend or no session yet.
 */
export async function deleteRemoteData(): Promise<RemoteDeletion> {
  const sb = supabase();
  if (!sb) return 'none';
  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) return 'none';
    const { error } = await sb.rpc('delete_my_data');
    if (error) return 'failed';
    await sb.auth.signOut();
    return 'deleted';
  } catch {
    return 'failed';
  }
}
