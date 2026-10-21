import { z } from 'zod';

// Mirrors pipeline/src/riftbuild_pipeline/models.py (pydantic is the source of truth, DECISIONS.md D4).

export const Slug = z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
export const PatchVersion = z.string().regex(/^\d+\.\d+[a-z]?$/);
export const IsoDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const HttpsUrl = z.string().regex(/^https:\/\//);

export const ROLES = ['baron', 'jungle', 'mid', 'dragon', 'support'] as const;
export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;

export const CHAMPION_CLASSES = [
  'tank',
  'fighter',
  'mage',
  'assassin',
  'marksman',
  'support',
] as const;
export const ChampionClass = z.enum(CHAMPION_CLASSES);

export const CHAMPION_TAGS = [
  'tank',
  'engage',
  'poke',
  'heal',
  'shield',
  'hard_cc',
  'soft_cc',
  'dash',
  'invulnerability',
  'projectile_reflect',
  'execute',
  'scaling',
] as const;
export const ChampionTag = z.enum(CHAMPION_TAGS);
export type ChampionTag = z.infer<typeof ChampionTag>;

export const HARD_CC_TYPES = [
  'stun',
  'airborne',
  'suppression',
  'root',
  'charm',
  'fear',
  'taunt',
  'sleep',
  'polymorph',
] as const;
export const SOFT_CC_TYPES = ['slow', 'silence', 'blind', 'ground', 'cripple'] as const;
export const CcType = z.enum([...HARD_CC_TYPES, ...SOFT_CC_TYPES]);
export type CcType = z.infer<typeof CcType>;

export const DamageType = z.enum(['physical', 'magic', 'true']);
export type DamageType = z.infer<typeof DamageType>;
export const AbilityKey = z.enum(['P', 'Q', 'W', 'E', 'R']);
export type AbilityKey = z.infer<typeof AbilityKey>;

export const ITEM_CATEGORIES = [
  'physical',
  'magic',
  'defense',
  'support',
  'boots',
  'component',
] as const;
export const ItemCategory = z.enum(ITEM_CATEGORIES);
export type ItemCategory = z.infer<typeof ItemCategory>;

export const ITEM_TAGS = [
  'anti_heal',
  'tenacity',
  'spell_shield',
  'stasis',
  'armor_pen',
  'magic_pen',
  'on_hit',
  'spellblade',
  'lifesteal',
  'omnivamp',
  'armor',
  'magic_resist',
  'health',
  'ability_power',
  'attack_damage',
  'attack_speed',
  'crit',
  'ability_haste',
  'shield',
  'heal_shield_power',
  'active',
] as const;
export const ItemTag = z.enum(ITEM_TAGS);
export type ItemTag = z.infer<typeof ItemTag>;

export const RUNE_PATHS = ['domination', 'precision', 'resolve', 'sorcery'] as const;
export const RunePath = z.enum(RUNE_PATHS);
export type RunePath = z.infer<typeof RunePath>;

export const ChangeKind = z.enum(['buff', 'nerf', 'change']);
export type ChangeKind = z.infer<typeof ChangeKind>;

export const STAT_KEYS = [
  'ad',
  'ap',
  'hp',
  'armor',
  'mr',
  'attack_speed',
  'crit',
  'ability_haste',
  'move_speed',
  'move_speed_pct',
  'armor_pen',
  'armor_pen_pct',
  'magic_pen',
  'magic_pen_pct',
  'lifesteal',
  'omnivamp',
  'heal_shield_power',
  'tenacity',
  'mana',
  'mana_regen',
  'hp_regen',
] as const;
export const StatKey = z.enum(STAT_KEYS);
export type StatKey = z.infer<typeof StatKey>;

export const provenanceShape = {
  game: z.literal('wild_rift').default('wild_rift'),
  patch: PatchVersion,
  source_url: HttpsUrl,
  collected_at: IsoDateTime,
  extra_sources: z.array(HttpsUrl).default([]),
};
