import { parseEnv } from '@/lib/env';

describe('parseEnv', () => {
  it('runs without a backend when nothing is configured', () => {
    const env = parseEnv({});
    expect(env.hasBackend).toBe(false);
    expect(env.manifestUrl).toBeUndefined();
    expect(env.allowFixtures).toBe(false);
  });

  it('derives the public manifest URL from the Supabase URL', () => {
    const env = parseEnv({ supabaseUrl: 'https://abc.supabase.co/', supabaseAnonKey: 'k' });
    expect(env.hasBackend).toBe(true);
    expect(env.manifestUrl).toBe(
      'https://abc.supabase.co/storage/v1/object/public/catalog/manifest.json',
    );
  });

  it('prefers an explicit manifest URL', () => {
    const env = parseEnv({ catalogManifestUrl: 'http://localhost:8080/local-data/manifest.json' });
    expect(env.manifestUrl).toBe('http://localhost:8080/local-data/manifest.json');
  });
});
