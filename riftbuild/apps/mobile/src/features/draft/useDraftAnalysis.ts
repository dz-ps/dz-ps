import {
  analyzeComp,
  selectCandidates,
  suggestBans,
  suggestCounterPicks,
  type AiDraftResponse,
  type CatalogIndex,
  type DraftSection,
  type MetaBundle,
  type Role,
} from '@riftbuild/shared';
import { useCallback, useRef, useState } from 'react';
import { streamDraft, type DraftStreamDeps } from '@/data/remote/ai';

export type DraftRequest = {
  enemies: string[];
  allies: string[];
  myChampion: string | null;
  myRole: Role | null;
  elo: string | null;
  style: string[];
  mains: string[];
  lossLog: Record<string, number>;
};

export type AiState =
  | { status: 'idle' | 'loading' }
  | {
      status: 'streaming' | 'done';
      sections: Partial<Record<DraftSection, unknown>>;
      response?: AiDraftResponse;
      incomplete?: boolean;
      cached?: boolean;
    }
  | {
      status: 'error';
      message: string;
      code: string;
      sections?: Partial<Record<DraftSection, unknown>>;
    };

/** Deterministic read (instant, offline) + AI analysis (streaming), spec §6.1. */
export function useDraftAnalysis(
  index: CatalogIndex | null,
  meta: MetaBundle | null,
  deps?: DraftStreamDeps,
) {
  const [deterministic, setDeterministic] = useState<ReturnType<typeof compute> | null>(null);
  const [ai, setAi] = useState<AiState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const compute = useCallback(
    (req: DraftRequest) => {
      const t0 = Date.now();
      const comp = analyzeComp(req.enemies, index!, meta, req.elo);
      const metaBuild = req.myChampion
        ? (meta?.builds.find(
            (b) => b.champion_id === req.myChampion && (!req.myRole || b.role === req.myRole),
          ) ?? null)
        : null;
      const candidates = selectCandidates({
        comp,
        myChampionId: req.myChampion,
        role: req.myRole,
        style: req.style,
        index: index!,
        metaBuild,
      });
      const picked = [...req.enemies, ...req.allies, ...(req.myChampion ? [req.myChampion] : [])];
      const counters =
        req.myRole && !req.myChampion
          ? suggestCounterPicks(index!, meta, req.myRole, req.elo, picked)
          : [];
      const bans = suggestBans({
        index: index!,
        meta,
        elo: req.elo,
        myRole: req.myRole,
        mains: req.mains,
        lossLog: req.lossLog,
        exclude: picked,
        limit: 3,
      });
      return { comp, candidates, counters, bans, metaBuild, ms: Date.now() - t0 };
    },
    [index, meta],
  );

  const analyze = useCallback(
    (req: DraftRequest) => {
      if (!index) return;
      const result = compute(req);
      setDeterministic(result);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setAi({ status: 'loading' });
      const sections: Partial<Record<DraftSection, unknown>> = {};
      void streamDraft(
        {
          patch: index.patch,
          bundle_hash: null,
          enemies: req.enemies,
          allies: req.allies,
          my_champion: req.myChampion,
          my_role: req.myRole,
          elo: req.elo,
          style: req.style,
        },
        {
          index,
          comp: result.comp,
          enemies: req.enemies,
          allies: req.allies,
          myChampionId: req.myChampion,
          role: req.myRole,
        },
        {
          onMeta: (m) =>
            setAi({ status: 'streaming', sections: { ...sections }, cached: m.cached }),
          onSection: (name, data) => {
            sections[name] = data;
            setAi((s) => ({
              status: 'streaming',
              sections: { ...sections },
              cached: 'cached' in s ? s.cached : false,
            }));
          },
          onDone: ({ response, incomplete }) =>
            setAi((s) => ({
              status: 'done',
              sections: { ...sections },
              response,
              incomplete,
              cached: 'cached' in s ? s.cached : false,
            })),
          onError: (message, code) =>
            setAi({ status: 'error', message, code, sections: { ...sections } }),
        },
        controller.signal,
        deps,
      );
    },
    [index, compute, deps],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setDeterministic(null);
    setAi({ status: 'idle' });
  }, []);

  return { deterministic, ai, analyze, reset };
}
