import type { AppStore, SavedBuild, SavedDraft, StoredRelease } from './types';

/** In-memory store: web build (screenshots/dev only) and tests. */
export function createMemoryStore(seed: { release?: StoredRelease | null } = {}): AppStore {
  let release: StoredRelease | null = seed.release ?? null;
  const builds = new Map<string, SavedBuild>();
  const drafts = new Map<string, SavedDraft>();
  let lossLog: Record<string, number> = {};
  return {
    loadRelease: async () => release,
    saveRelease: async (r) => {
      release = r;
    },
    listBuilds: async () =>
      [...builds.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    saveBuild: async (b) => {
      builds.set(b.id, b);
    },
    deleteBuild: async (id) => {
      builds.delete(id);
    },
    listDrafts: async (limit = 30) =>
      [...drafts.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit),
    saveDraft: async (d) => {
      drafts.set(d.id, d);
    },
    getLossLog: async () => ({ ...lossLog }),
    setLossLog: async (log) => {
      lossLog = { ...log };
    },
    wipeUserData: async () => {
      builds.clear();
      drafts.clear();
      lossLog = {};
    },
  };
}
