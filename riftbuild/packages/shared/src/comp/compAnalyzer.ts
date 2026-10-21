import { displayName, type CatalogIndex } from '../catalog/index.ts';
import type { Champion } from '../schemas/catalog.ts';
import {
  HARD_CC_TYPES,
  SOFT_CC_TYPES,
  type CcType,
  type ChampionTag,
  type Role,
} from '../schemas/common.ts';
import type { MetaBundle } from '../schemas/meta.ts';

export type HealingLevel = 'nenhuma' | 'baixa' | 'media' | 'alta';

export type CcSource = {
  championId: string;
  abilityKey: string;
  abilityName: string;
  types: CcType[];
};

export type CompRead = {
  championIds: string[];
  damage: { physical: number; magic: number; true: number };
  /** Champions whose damage profile is unknown (excluded from the average). */
  damageUnknown: string[];
  hardCcCount: number;
  softCcCount: number;
  ccSources: CcSource[];
  ccTypes: Partial<Record<CcType, number>>;
  healing: HealingLevel;
  healingScore: number;
  healers: string[];
  shielders: string[];
  engage: string[];
  poke: string[];
  tanks: string[];
  scaling: string[];
  dashes: string[];
  invulnerable: string[];
  projectileBlock: string[];
  threats: { championId: string; reason_pt: string; score: number }[];
  /** Short, evidence-based warnings derived from ability tags (e.g. projectile block on W). */
  alerts_pt: string[];
};

const HARD = new Set<string>(HARD_CC_TYPES);
const SOFT = new Set<string>(SOFT_CC_TYPES);
const CARRY_WEIGHT: Record<string, number> = {
  marksman: 3,
  mage: 2.5,
  assassin: 2.5,
  fighter: 1.5,
  support: 0.5,
  tank: 0.5,
};

const hasTag = (c: Champion, tag: ChampionTag) => c.tags.some((t) => t.tag === tag);

/**
 * Instant, deterministic read of a team composition from catalog tags (spec §6.1 step 1, < 1 s).
 * Everything here comes from catalog data; derived tags are labelled "estimado" in the UI.
 */
export function analyzeComp(
  championIds: string[],
  index: CatalogIndex,
  meta?: MetaBundle | null,
  elo?: string | null,
): CompRead {
  const champions = championIds
    .map((id) => index.champions.get(id))
    .filter((c): c is Champion => !!c);
  const damageTotals = { physical: 0, magic: 0, true: 0 };
  const damageUnknown: string[] = [];
  const ccSources: CcSource[] = [];
  const ccTypes: Partial<Record<CcType, number>> = {};
  const read: CompRead = {
    championIds: champions.map((c) => c.id),
    damage: damageTotals,
    damageUnknown,
    hardCcCount: 0,
    softCcCount: 0,
    ccSources,
    ccTypes,
    healing: 'nenhuma',
    healingScore: 0,
    healers: [],
    shielders: [],
    engage: [],
    poke: [],
    tanks: [],
    scaling: [],
    dashes: [],
    invulnerable: [],
    projectileBlock: [],
    threats: [],
    alerts_pt: [],
  };

  let profiled = 0;
  for (const c of champions) {
    if (c.damage_profile) {
      damageTotals.physical += c.damage_profile.physical;
      damageTotals.magic += c.damage_profile.magic;
      damageTotals.true += c.damage_profile.true;
      profiled++;
    } else damageUnknown.push(c.id);

    for (const ability of c.abilities) {
      const hard = ability.cc_types.filter((t) => HARD.has(t));
      const soft = ability.cc_types.filter((t) => SOFT.has(t));
      if (hard.length) read.hardCcCount++;
      if (soft.length && !hard.length) read.softCcCount++;
      if (ability.cc_types.length) {
        ccSources.push({
          championId: c.id,
          abilityKey: ability.key,
          abilityName: displayName(ability),
          types: ability.cc_types,
        });
        for (const t of ability.cc_types) ccTypes[t] = (ccTypes[t] ?? 0) + 1;
      }
    }
    if (hasTag(c, 'heal')) {
      read.healers.push(c.id);
      read.healingScore += c.classes.includes('support') || c.roles.includes('support') ? 2 : 1;
    }
    if (hasTag(c, 'shield')) read.shielders.push(c.id);
    if (hasTag(c, 'engage')) read.engage.push(c.id);
    if (hasTag(c, 'poke')) read.poke.push(c.id);
    if (hasTag(c, 'tank') || c.classes.includes('tank')) read.tanks.push(c.id);
    if (hasTag(c, 'scaling')) read.scaling.push(c.id);
    if (hasTag(c, 'dash')) read.dashes.push(c.id);
    if (hasTag(c, 'invulnerability')) read.invulnerable.push(c.id);
    if (hasTag(c, 'projectile_reflect')) read.projectileBlock.push(c.id);
  }

  if (profiled) {
    read.damage = {
      physical: round(damageTotals.physical / profiled),
      magic: round(damageTotals.magic / profiled),
      true: round(damageTotals.true / profiled),
    };
  }
  read.healing =
    read.healingScore === 0
      ? 'nenhuma'
      : read.healingScore === 1
        ? 'baixa'
        : read.healingScore === 2
          ? 'media'
          : 'alta';
  read.threats = rankThreats(champions, meta, elo);
  read.alerts_pt = alerts(champions);
  return read;
}

function alerts(champions: Champion[]): string[] {
  const out: string[] = [];
  for (const c of champions) {
    const name = displayName(c);
    for (const t of c.tags) {
      const key = t.ability_key ? ` (${t.ability_key})` : '';
      if (t.tag === 'projectile_reflect') {
        out.push(
          `${name}${key} bloqueia projéteis: não gaste habilidades de projétil, nem o ultimate, com o ${t.ability_key ?? 'efeito'} dele(a) disponível.`,
        );
      } else if (t.tag === 'invulnerability') {
        out.push(
          `${name}${key} pode ficar invulnerável: espere o efeito acabar antes de usar habilidades importantes.`,
        );
      }
    }
  }
  return out;
}

function rankThreats(champions: Champion[], meta?: MetaBundle | null, elo?: string | null) {
  const ranked = champions.map((c) => {
    const mainlySupport = c.roles[0] === 'support';
    const carry = Math.min(
      mainlySupport ? 1 : Infinity,
      Math.max(0, ...c.classes.map((k) => CARRY_WEIGHT[k] ?? 1)),
    );
    const stat = bestStat(c.id, c.roles, meta, elo);
    // Who to focus in a fight is mostly about the carry role; patch strength only nudges the order.
    const metaBonus = stat ? Math.min(1, Math.max(0, (stat.win_rate - 50) / 4)) : 0;
    const scaling = hasTag(c, 'scaling') ? 0.5 : 0;
    const score = round(carry + metaBonus + scaling);
    const parts = [carryLabel(c)];
    if (stat && stat.win_rate >= 51) parts.push(`${pct(stat.win_rate)}% de vitória no patch`);
    return { championId: c.id, score, reason_pt: parts.join(', ') };
  });
  return ranked.sort((a, b) => b.score - a.score).slice(0, 2);
}

function carryLabel(c: Champion): string {
  if (c.roles[0] === 'support') return 'suporte: protege e sustenta o time';
  if (c.classes.includes('marksman')) return 'atirador: principal dano contínuo';
  if (c.classes.includes('mage')) return 'mago: dano mágico em área';
  if (c.classes.includes('assassin')) return 'assassino: elimina alvos frágeis';
  if (c.classes.includes('fighter')) return 'lutador: dano e resistência';
  return 'suporte/tanque';
}

export function bestStat(
  championId: string,
  roles: Role[],
  meta?: MetaBundle | null,
  elo?: string | null,
) {
  if (!meta) return undefined;
  const tier = elo ?? meta.rank_tiers[0];
  const stats = meta.stats.filter((s) => s.champion_id === championId && s.rank_tier === tier);
  const inRole = stats.filter((s) => roles.includes(s.role));
  return (inRole.length ? inRole : stats).sort((a, b) => b.pick_rate - a.pick_rate)[0];
}

const round = (n: number) => Math.round(n * 100) / 100;

/** pt-BR decimal comma for user-facing percentages. */
export const pct = (n: number) => n.toFixed(1).replace('.', ',');
