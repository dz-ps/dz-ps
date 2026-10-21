import type { SavedDraft } from '@/data/store/types';

// Profile → Draft tab: reopen a saved draft at the confirm step (same pattern as builds/handoff.ts).
let pending: SavedDraft | null = null;

export function setPendingDraft(draft: SavedDraft): void {
  pending = draft;
}

export function takePendingDraft(): SavedDraft | null {
  const draft = pending;
  pending = null;
  return draft;
}
