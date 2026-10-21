// Global test setup for the mobile app.

// MMKV 4 needs Nitro native modules; tests use an in-memory stand-in for the single storage wrapper (D7).
jest.mock('@/lib/storage', () => {
  const map = new Map<string, string>();
  return {
    prefs: {
      getString: (k: string) => map.get(k),
      setString: (k: string, v: string) => void map.set(k, v),
      getJSON: (k: string) => (map.has(k) ? JSON.parse(map.get(k)!) : undefined),
      setJSON: (k: string, v: unknown) => void map.set(k, JSON.stringify(v)),
      delete: (k: string) => void map.delete(k),
      clearAll: () => map.clear(),
    },
  };
});
