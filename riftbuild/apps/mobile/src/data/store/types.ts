import type {
  AiDraftResponse,
  CatalogBundle,
  Manifest,
  MetaBundle,
  UserBuild,
} from '@riftbuild/shared';

export type StoredRelease = {
  catalog: CatalogBundle;
  catalogHash: string;
  meta: MetaBundle | null;
  metaHash: string | null;
  manifest: Manifest;
  savedAt: string;
};

export type SavedBuild = {
  id: string;
  name: string;
  favorite: boolean;
  patch: string;
  build: UserBuild;
  createdAt: string;
  updatedAt: string;
};

export type SavedDraft = {
  id: string;
  patch: string;
  enemies: string[];
  allies: string[];
  myChampion: string | null;
  myRole: string | null;
  response: AiDraftResponse | null;
  createdAt: string;
};

/**
 * Everything the app persists. Catalog releases and user data are separate: syncing a new catalog never
 * touches builds, drafts or the loss log (DECISIONS.md D5/D6).
 */
export interface AppStore {
  loadRelease(): Promise<StoredRelease | null>;
  saveRelease(release: StoredRelease): Promise<void>;
  listBuilds(): Promise<SavedBuild[]>;
  saveBuild(build: SavedBuild): Promise<void>;
  deleteBuild(id: string): Promise<void>;
  listDrafts(limit?: number): Promise<SavedDraft[]>;
  saveDraft(draft: SavedDraft): Promise<void>;
  getLossLog(): Promise<Record<string, number>>;
  setLossLog(log: Record<string, number>): Promise<void>;
  wipeUserData(): Promise<void>;
}
