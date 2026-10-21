import {
  canAddItem,
  emptyBuild,
  type CatalogIndex,
  type Role,
  type RunePage,
  type UserBuild,
} from '@riftbuild/shared';

export type EditorState = { build: UserBuild; blocked: { message: string; at: number } | null };

export type EditorAction =
  | { type: 'load'; build: UserBuild }
  | { type: 'champion'; id: string | null }
  | { type: 'role'; role: Role | null }
  | { type: 'addItem'; id: string; slot?: number }
  | { type: 'removeItem'; slot: number }
  | { type: 'moveItem'; slot: number; dir: -1 | 1 }
  | { type: 'runes'; runes: RunePage }
  | { type: 'spell'; index: 0 | 1; id: string | null }
  | { type: 'skillOrder'; order: string[] }
  | { type: 'dismissBlocked' };

export function initialEditorState(index: CatalogIndex | null, build?: UserBuild): EditorState {
  const slots = index?.rules.item_slots ?? 6;
  const base = build ?? emptyBuild(slots);
  const items = Array.from({ length: slots }, (_, i) => base.items[i] ?? null);
  return { build: { ...base, items }, blocked: null };
}

/**
 * Build editor reducer. Every add goes through the shared canAddItem (same rules the AI is validated
 * with); a blocked add leaves the slots untouched and records why (spec §5.2).
 */
export function editorReducer(index: CatalogIndex) {
  return (state: EditorState, action: EditorAction): EditorState => {
    const b = state.build;
    switch (action.type) {
      case 'load':
        return initialEditorState(index, action.build);
      case 'champion':
        return { ...state, build: { ...b, championId: action.id } };
      case 'role':
        return { ...state, build: { ...b, role: action.role } };
      case 'addItem': {
        const check = canAddItem(b, action.id, index, action.slot);
        if (!check.ok) return { ...state, blocked: { message: check.message_pt, at: Date.now() } };
        const items = b.items.slice();
        const slot = action.slot ?? items.findIndex((i) => i === null);
        items[slot] = action.id;
        return { build: { ...b, items }, blocked: null };
      }
      case 'removeItem': {
        const items = b.items.slice();
        items[action.slot] = null;
        return { ...state, build: { ...b, items } };
      }
      case 'moveItem': {
        const to = action.slot + action.dir;
        if (to < 0 || to >= b.items.length) return state;
        const items = b.items.slice();
        [items[action.slot], items[to]] = [items[to]!, items[action.slot]!];
        return { ...state, build: { ...b, items } };
      }
      case 'runes':
        return { ...state, build: { ...b, runes: action.runes } };
      case 'spell': {
        const spells = [...b.spells] as [string | null, string | null];
        spells[action.index] = action.id;
        return { ...state, build: { ...b, spells } };
      }
      case 'skillOrder':
        return { ...state, build: { ...b, skillOrder: action.order } };
      case 'dismissBlocked':
        return { ...state, blocked: null };
    }
  };
}
