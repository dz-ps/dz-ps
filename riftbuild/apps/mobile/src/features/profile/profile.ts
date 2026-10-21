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
}
