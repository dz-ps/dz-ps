import { z } from 'zod';

// Edge Function configuration. Model IDs are required and never hardcoded (spec §6.2): set them with
// `supabase secrets set` after checking the current names at https://docs.claude.com.
const intFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : fallback))
    .pipe(z.number().int().positive());

export const AiEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  AI_MODEL_DRAFT: z.string().min(1),
  AI_MODEL_REVIEW: z.string().min(1),
  AI_MODEL_TIPS: z.string().min(1),
  AI_EFFORT_DRAFT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('low'),
  AI_EFFORT_REVIEW: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  AI_MAX_TOKENS_DRAFT: intFromEnv(8000),
  AI_MAX_TOKENS_REVIEW: intFromEnv(16000),
  AI_TIMEOUT_MS_DRAFT: intFromEnv(15000),
  AI_TIMEOUT_MS_REVIEW: intFromEnv(60000),
  AI_SCHEMA_ENUMS: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  AI_SERVER_FALLBACKS: z.enum(['default', 'off']).default('default'),
  AI_DAILY_LIMIT_DRAFT: intFromEnv(30),
  AI_DAILY_LIMIT_REVIEW: intFromEnv(10),
  AI_GLOBAL_DAILY_LIMIT: intFromEnv(2000),
  AI_CACHE_TTL_HOURS: intFromEnv(72),
  RATE_LIMIT_SALT: z.string().default('riftbuild'),
  ALLOW_DEVICE_FALLBACK: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CATALOG_MANIFEST_URL: z.string().url().optional(),
});
export type AiEnv = z.infer<typeof AiEnvSchema>;

export class ConfigError extends Error {}

export function readEnv(get: (key: string) => string | undefined): AiEnv {
  const keys = Object.keys(AiEnvSchema.shape);
  const raw = Object.fromEntries(keys.map((k) => [k, get(k)]));
  const parsed = AiEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new ConfigError(`Configuração da IA incompleta: ${missing}`);
  }
  return parsed.data;
}

export function manifestUrl(env: Pick<AiEnv, 'SUPABASE_URL' | 'CATALOG_MANIFEST_URL'>): string {
  return (
    env.CATALOG_MANIFEST_URL ??
    `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/catalog/manifest.json`
  );
}
