import type { AppStore } from '@/data/store/types';

/** "Perdi para…" (spec §5.5): local count of losses per enemy champion; feeds the ban suggestions. */
export async function recordLoss(
  store: AppStore,
  championId: string,
): Promise<Record<string, number>> {
  const log = await store.getLossLog();
  log[championId] = (log[championId] ?? 0) + 1;
  await store.setLossLog(log);
  return log;
}

export async function forgetLoss(
  store: AppStore,
  championId: string,
): Promise<Record<string, number>> {
  const log = await store.getLossLog();
  delete log[championId];
  await store.setLossLog(log);
  return log;
}
