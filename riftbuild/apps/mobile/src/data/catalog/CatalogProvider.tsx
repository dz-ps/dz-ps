import {
  championSearchIndex,
  indexCatalog,
  type CatalogIndex,
  type MetaBundle,
  type SearchIndex,
} from '@riftbuild/shared';
import { Image } from 'expo-image';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { env } from '@/lib/env';
import { prefs } from '@/lib/storage';
import type { AppStore, StoredRelease } from '../store/types';
import { staleMessage, syncRelease, SyncError, type SyncDeps } from './sync';

export type CatalogStatus = 'loading' | 'ready' | 'empty';

export type CatalogContextValue = {
  status: CatalogStatus;
  store: AppStore;
  release: StoredRelease | null;
  index: CatalogIndex | null;
  meta: MetaBundle | null;
  championSearch: SearchIndex | null;
  gamePatch: string | null;
  staleBanner: string | null;
  syncing: boolean;
  syncError: string | null;
  lastCheckedAt: string | null;
  iconUrl: (name: string | null | undefined) => string | null;
  refresh: () => Promise<void>;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);
const SIX_HOURS = 6 * 3600 * 1000;

export type CatalogProviderProps = {
  store: AppStore;
  children: ReactNode;
  /** Injected for tests; defaults to the real network sync. */
  syncDeps?: Partial<SyncDeps> | null;
};

export function CatalogProvider({ store, children, syncDeps }: CatalogProviderProps) {
  const [status, setStatus] = useState<CatalogStatus>('loading');
  const [release, setRelease] = useState<StoredRelease | null>(null);
  const [gamePatch, setGamePatch] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(
    () => prefs.getString('catalog.lastCheck') ?? null,
  );
  const inFlight = useRef<Promise<void> | null>(null);

  const deps = useMemo<SyncDeps | null>(() => {
    const manifestUrl = syncDeps?.manifestUrl ?? env.manifestUrl;
    if (syncDeps === null || !manifestUrl) return null;
    return {
      manifestUrl,
      fetchFn: syncDeps?.fetchFn ?? ((input, init) => fetch(input, init)),
      digest: syncDeps?.digest ?? defaultDigest,
      allowFixtures: syncDeps?.allowFixtures ?? env.allowFixtures,
      allowPartial: syncDeps?.allowPartial ?? env.allowPartial,
    };
  }, [syncDeps]);

  const refresh = useCallback(async () => {
    if (!deps) return;
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      setSyncing(true);
      try {
        const current = await store.loadRelease();
        const result = await syncRelease(current, deps);
        setGamePatch(result.gamePatch);
        if (result.kind === 'updated') {
          await store.saveRelease(result.release);
          setRelease(result.release);
          setStatus('ready');
          void prefetchIcons(result.release);
        } else if (result.kind === 'unchanged') {
          setRelease((r) => r ?? result.release);
          setStatus('ready');
        } else if (!current) {
          setStatus('empty');
        }
        setSyncError(null);
        const now = new Date().toISOString();
        prefs.setString('catalog.lastCheck', now);
        setLastCheckedAt(now);
      } catch (err) {
        setSyncError(err instanceof SyncError ? err.message : 'Falha ao atualizar os dados.');
        setStatus((s) => (s === 'loading' ? 'empty' : s));
      } finally {
        setSyncing(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [deps, store]);

  // Startup never waits on the network: render the stored release first, then check in the background.
  useEffect(() => {
    let cancelled = false;
    void store.loadRelease().then((stored) => {
      if (cancelled) return;
      if (stored) {
        setRelease(stored);
        setGamePatch(stored.manifest.game_patch.version);
        setStatus('ready');
      } else if (!deps) setStatus('empty');
      void refresh();
    });
    const sub = AppState.addEventListener('change', (state) => {
      const last = prefs.getString('catalog.lastCheck');
      if (state === 'active' && (!last || Date.now() - Date.parse(last) > SIX_HOURS))
        void refresh();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [store, deps, refresh]);

  const index = useMemo(() => (release ? indexCatalog(release.catalog) : null), [release]);
  const championSearch = useMemo(() => (index ? championSearchIndex(index) : null), [index]);
  const iconsBase = release?.manifest.icons_base ?? null;
  const iconUrl = useCallback(
    (name: string | null | undefined) => {
      if (!name) return null;
      if (/^https?:\/\//.test(name)) return null; // never hotlink third-party URLs (spec §4.4)
      return iconsBase ? `${iconsBase.replace(/\/?$/, '/')}${name}` : null;
    },
    [iconsBase],
  );

  const value = useMemo<CatalogContextValue>(
    () => ({
      status,
      store,
      release,
      index,
      meta: release?.meta ?? null,
      championSearch,
      gamePatch,
      staleBanner: staleMessage(release?.catalog.patch, gamePatch),
      syncing,
      syncError,
      lastCheckedAt,
      iconUrl,
      refresh,
    }),
    [
      status,
      store,
      release,
      index,
      championSearch,
      gamePatch,
      syncing,
      syncError,
      lastCheckedAt,
      iconUrl,
      refresh,
    ],
  );
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return ctx;
}

async function defaultDigest(data: Uint8Array): Promise<ArrayBuffer> {
  const Crypto = await import('expo-crypto');
  return Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data as Uint8Array<ArrayBuffer>);
}

/** Warm the disk cache so icons work in airplane mode after the first sync (spec §7). */
async function prefetchIcons(release: StoredRelease) {
  const base = release.manifest.icons_base.replace(/\/?$/, '/');
  const names = new Set<string>();
  for (const c of release.catalog.champions) {
    if (c.icon) names.add(c.icon);
    for (const a of c.abilities) if (a.icon) names.add(a.icon);
  }
  for (const i of release.catalog.items) if (i.icon) names.add(i.icon);
  for (const r of release.catalog.runes) if (r.icon) names.add(r.icon);
  for (const s of release.catalog.summoner_spells) if (s.icon) names.add(s.icon);
  const urls = [...names].map((n) => base + n);
  for (let i = 0; i < urls.length; i += 40) {
    await Image.prefetch(urls.slice(i, i + 40), 'memory-disk').catch(() => false);
  }
}
