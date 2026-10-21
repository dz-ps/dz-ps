import { z } from 'zod';
import { Role, Slug } from './common.ts';

// Structured AI output for /ai/draft (spec §6.4). Field names follow the spec exactly.
export const Confidence = z.enum(['alta', 'media', 'baixa']);
export const Healing = z.enum(['nenhuma', 'baixa', 'media', 'alta']);

export const AiCompRead = z.strictObject({
  damage: z.strictObject({ physical: z.number(), magic: z.number(), true: z.number() }),
  hard_cc_count: z.number().int(),
  healing: Healing,
  threats: z.array(Slug),
});

export const AiReasoned = z.strictObject({ id: Slug, reason: z.string() });

export const AiRunes = z.strictObject({
  keystone: Slug,
  primary_path: z.enum(['domination', 'precision', 'resolve', 'sorcery']),
  primary: z.array(Slug),
  secondary: Slug,
});

export const AiBuild = z.strictObject({
  items: z.array(AiReasoned),
  boots: AiReasoned.nullable(),
  runes: AiRunes.nullable(),
  spells: z.array(Slug).nullable(),
  skill_order: z.string().nullable(),
});

export const AiCounterPick = z.strictObject({ champion_id: Slug, role: Role, reason: z.string() });
export const AiBan = z.strictObject({ champion_id: Slug, reason: z.string() });

export const AiDraftResponse = z.strictObject({
  patch: z.string(),
  comp_read: AiCompRead,
  build: AiBuild,
  counter_picks: z.array(AiCounterPick),
  bans: z.array(AiBan),
  game_plan: z.array(z.string()),
  confidence: Confidence,
  missing_data: z.array(z.string()),
});
export type AiDraftResponse = z.infer<typeof AiDraftResponse>;

export const DRAFT_SECTIONS = ['comp_read', 'build', 'counter_picks', 'bans', 'game_plan'] as const;
export type DraftSection = (typeof DRAFT_SECTIONS)[number];

export const DraftInput = z.strictObject({
  patch: z.string(),
  bundle_hash: z.string().nullable().default(null),
  enemies: z.array(Slug).min(1).max(5),
  allies: z.array(Slug).max(4).default([]),
  my_champion: Slug.nullable().default(null),
  my_role: Role.nullable().default(null),
  elo: z.string().nullable().default(null),
  style: z.array(z.string().max(40)).max(5).default([]),
});
export type DraftInput = z.infer<typeof DraftInput>;

export const AiBuildReview = z.strictObject({
  patch: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  swaps: z.array(z.strictObject({ remove: Slug, add: Slug, reason: z.string() })),
  confidence: Confidence,
  missing_data: z.array(z.string()),
});
export type AiBuildReview = z.infer<typeof AiBuildReview>;

export const AiMetaTips = z.strictObject({
  patch: z.string(),
  role: Role,
  tips: z.array(
    z.strictObject({
      champion_id: Slug,
      power_spikes: z.array(z.string()),
      combos: z.array(z.string()),
      common_mistakes: z.array(z.string()),
    }),
  ),
  missing_data: z.array(z.string()),
});
export type AiMetaTips = z.infer<typeof AiMetaTips>;
