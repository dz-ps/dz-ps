import { createMMKV, type MMKV } from 'react-native-mmkv';

// The only module that touches MMKV directly (preferences only; catalog and user data live in SQLite).
let instance: MMKV | undefined;

function mmkv(): MMKV {
  instance ??= createMMKV({ id: 'riftbuild-prefs' });
  return instance;
}

export const prefs = {
  getString(key: string): string | undefined {
    return mmkv().getString(key);
  },
  setString(key: string, value: string): void {
    mmkv().set(key, value);
  },
  getJSON<T>(key: string): T | undefined {
    const value = mmkv().getString(key);
    if (value === undefined) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  },
  setJSON(key: string, value: unknown): void {
    mmkv().set(key, JSON.stringify(value));
  },
  delete(key: string): void {
    mmkv().remove(key);
  },
  keys(): string[] {
    return mmkv().getAllKeys();
  },
  clearAll(): void {
    mmkv().clearAll();
  },
};
