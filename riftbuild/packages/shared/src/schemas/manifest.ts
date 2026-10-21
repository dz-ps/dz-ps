import { z } from 'zod';
import { HttpsUrl, IsoDateTime, PatchVersion } from './common.ts';

export const ManifestEntry = z.strictObject({
  patch: PatchVersion,
  hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  path: z.string(),
  bytes: z.number().int().min(0),
  published_at: IsoDateTime,
});
export type ManifestEntry = z.infer<typeof ManifestEntry>;

export const GamePatchInfo = z.strictObject({
  version: PatchVersion,
  source_url: HttpsUrl,
  detected_at: IsoDateTime,
});

export const Manifest = z.strictObject({
  schema_version: z.literal(1).default(1),
  game: z.literal('wild_rift').default('wild_rift'),
  game_patch: GamePatchInfo,
  catalog: ManifestEntry.nullable(),
  meta: ManifestEntry.nullable(),
  icons_base: z.string(),
  verified_at: IsoDateTime,
});
export type Manifest = z.infer<typeof Manifest>;
