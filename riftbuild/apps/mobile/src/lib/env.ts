import { z } from 'zod';

// Expo only inlines EXPO_PUBLIC_* variables that are referenced statically, so list them one by one.
const raw = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  catalogManifestUrl: process.env.EXPO_PUBLIC_CATALOG_MANIFEST_URL,
  allowFixtures: process.env.EXPO_PUBLIC_ALLOW_FIXTURES,
  allowPartial: process.env.EXPO_PUBLIC_ALLOW_PARTIAL,
};

const flag = z
  .string()
  .optional()
  .transform((v) => v === '1' || v === 'true');

const optionalUrl = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.url().optional());

const EnvSchema = z.object({
  supabaseUrl: optionalUrl,
  supabaseAnonKey: z.string().optional(),
  catalogManifestUrl: optionalUrl,
  allowFixtures: flag,
  allowPartial: flag,
});

export type AppEnv = z.infer<typeof EnvSchema> & {
  /** Where the catalog manifest lives: explicit override, or the public Supabase Storage bucket. */
  manifestUrl: string | undefined;
  hasBackend: boolean;
};

export function parseEnv(input: Record<string, string | undefined>): AppEnv {
  const parsed = EnvSchema.parse(input);
  const manifestUrl =
    parsed.catalogManifestUrl ??
    (parsed.supabaseUrl
      ? `${parsed.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/catalog/manifest.json`
      : undefined);
  return {
    ...parsed,
    manifestUrl,
    hasBackend: Boolean(parsed.supabaseUrl && parsed.supabaseAnonKey),
  };
}

export const env: AppEnv = parseEnv(raw);
