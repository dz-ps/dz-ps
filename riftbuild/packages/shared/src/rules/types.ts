import type { Role } from '../schemas/common.ts';

export type RunePage = {
  keystone: string | null;
  primaryPath: string | null;
  /** One rune per primary slot, in slot order (slot 1, 2, 3). */
  primary: (string | null)[];
  secondary: string | null;
};

export type UserBuild = {
  championId: string | null;
  role: Role | null;
  /** Fixed-length slot array (length = rules.item_slots); null = empty slot. */
  items: (string | null)[];
  runes: RunePage;
  spells: [string | null, string | null];
  /** Ability keys in leveling priority, e.g. ["Q", "W", "E"]. */
  skillOrder: string[];
  /** Item ids in purchase order (may include components). */
  purchaseOrder: string[];
};

export type IssueCode =
  | 'NOT_IN_CATALOG'
  | 'TOO_MANY_ITEMS'
  | 'SECOND_BOOTS'
  | 'ITEM_LIMIT'
  | 'UNIQUE_GROUP_OVERLAP'
  | 'RUNE_KEYSTONE_MISSING'
  | 'RUNE_KEYSTONE_INVALID'
  | 'RUNE_PATH_MISSING'
  | 'RUNE_PRIMARY_INVALID'
  | 'RUNE_SECONDARY_INVALID'
  | 'RUNE_SECONDARY_SAME_PATH'
  | 'SPELL_MISSING'
  | 'SPELL_DUPLICATE'
  | 'SPELL_NOT_SELECTABLE'
  | 'SPELL_JUNGLE_REQUIRED'
  | 'SPELL_JUNGLE_ONLY';

export type Issue = {
  code: IssueCode;
  severity: 'error' | 'warning';
  message_pt: string;
  ids: string[];
};

export type ValidationResult = { errors: Issue[]; warnings: Issue[] };

export function emptyRunePage(): RunePage {
  return { keystone: null, primaryPath: null, primary: [null, null, null], secondary: null };
}

export function emptyBuild(itemSlots: number): UserBuild {
  return {
    championId: null,
    role: null,
    items: Array.from({ length: itemSlots }, () => null),
    runes: emptyRunePage(),
    spells: [null, null],
    skillOrder: [],
    purchaseOrder: [],
  };
}

export function issue(
  code: IssueCode,
  severity: Issue['severity'],
  message_pt: string,
  ids: string[] = [],
): Issue {
  return { code, severity, message_pt, ids };
}

export function split(issues: Issue[]): ValidationResult {
  return {
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning'),
  };
}
