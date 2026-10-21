import { deleteRemoteData, type RemoteDeletion } from '@/data/remote/account';
import type { AppStore } from '@/data/store/types';
import { prefs } from '@/lib/storage';

// Supabase keeps its session under "sb-<project>-auth-token".
const isAuthKey = (key: string) => key.startsWith('sb-');

/**
 * "Apagar meus dados" (LGPD): builds, drafts, loss log, profile and preferences on the device, plus the
 * server-side rows of the anonymous session. The downloaded catalog stays (it is game data, not user data).
 * If the server could not be reached, the session is kept so the user can retry the remote part later.
 */
export async function deleteAllMyData(
  store: AppStore,
  remote: () => Promise<RemoteDeletion> = deleteRemoteData,
): Promise<{ remote: RemoteDeletion }> {
  const result = await remote();
  await store.wipeUserData();
  if (result === 'failed') {
    for (const key of prefs.keys()) if (!isAuthKey(key)) prefs.delete(key);
  } else {
    prefs.clearAll();
  }
  return { remote: result };
}

export function deletionMessage(remote: RemoteDeletion): string {
  if (remote === 'failed')
    return 'Seus dados no aparelho foram apagados. Não foi possível apagar os dados no servidor agora: conecte-se à internet e toque de novo em "Apagar meus dados".';
  if (remote === 'deleted') return 'Pronto: seus dados no aparelho e no servidor foram apagados.';
  return 'Pronto: seus dados no aparelho foram apagados.';
}
