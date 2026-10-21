import type { Role } from '@riftbuild/shared';
import { prefs } from '@/lib/storage';

/** Local-only profile (spec §5.6; LGPD: no account needed). */
export type Profile = { mains: string[]; role: Role | null; elo: string | null; style: string[] };

const KEY = 'profile';
const EMPTY: Profile = { mains: [], role: null, elo: null, style: [] };

export function loadProfile(): Profile {
  return { ...EMPTY, ...(prefs.getJSON<Partial<Profile>>(KEY) ?? {}) };
}

export function saveProfile(profile: Profile): void {
  prefs.setJSON(KEY, profile);
  // The profile elo is also the default filter of the meta screens.
  if (profile.elo) prefs.setString('meta.elo', profile.elo);
}

export const MAX_MAINS = 3;

/** Style preferences sent to the build rules and the AI (spec §5.6). "AP"/"AD" steer item candidates. */
export const STYLE_OPTIONS = ['AP', 'AD', 'agressivo', 'seguro', 'tanque'] as const;
const EXCLUSIVE: Record<string, string> = {
  AP: 'AD',
  AD: 'AP',
  agressivo: 'seguro',
  seguro: 'agressivo',
};

export function toggleStyle(style: string[], value: string): string[] {
  if (style.includes(value)) return style.filter((s) => s !== value);
  return [...style.filter((s) => s !== EXCLUSIVE[value]), value];
}
