import type { ItemTag } from '../schemas/common.ts';
import type { CompRead } from './compAnalyzer.ts';

/**
 * Deterministic counter-item rules (spec §6.1). Data, not code paths: thresholds and reasons live here.
 * Each rule selects catalog items by tag; the AI then picks among these candidates.
 */
export type CandidateRule = {
  id: string;
  /** Items must carry every tag in `all` and at least one in `any` (when given). */
  all: ItemTag[];
  any?: ItemTag[];
  /** Restrict to boots, or to items matching the player's damage type. */
  scope: 'boots' | 'my_damage' | 'defense' | 'any';
  when: (comp: CompRead) => boolean;
  reason: (comp: CompRead, names: (ids: string[]) => string) => string;
};

export const CANDIDATE_RULES: CandidateRule[] = [
  {
    id: 'anti_heal',
    all: ['anti_heal'],
    scope: 'my_damage',
    when: (c) => c.healingScore >= 2,
    reason: (c, names) => `Anti-cura: ${names(c.healers)} curam muito.`,
  },
  {
    id: 'tenacity',
    all: ['tenacity'],
    scope: 'any',
    when: (c) => c.hardCcCount >= 4,
    reason: (c) => `Tenacidade: ${c.hardCcCount} habilidades com controle pesado no time inimigo.`,
  },
  {
    id: 'magic_resist',
    all: ['magic_resist'],
    scope: 'defense',
    when: (c) => c.damage.magic > 0.6,
    reason: (c) =>
      `Resistência mágica: cerca de ${Math.round(c.damage.magic * 100)}% do dano inimigo é mágico.`,
  },
  {
    id: 'armor',
    all: ['armor'],
    scope: 'defense',
    when: (c) => c.damage.physical > 0.6,
    reason: (c) =>
      `Armadura: cerca de ${Math.round(c.damage.physical * 100)}% do dano inimigo é físico.`,
  },
  {
    id: 'spell_shield',
    all: [],
    any: ['spell_shield'],
    scope: 'any',
    when: (c) => c.engage.length >= 2,
    reason: (c, names) => `Escudo de feitiço: ${names(c.engage)} iniciam lutas com habilidade.`,
  },
  {
    id: 'stasis',
    all: ['stasis'],
    scope: 'any',
    when: (c) => c.engage.length >= 2 || c.dashes.length >= 3,
    reason: () => 'Estase: muitos inimigos com avanço e iniciação para te alcançar.',
  },
  {
    id: 'penetration',
    all: [],
    any: ['armor_pen', 'magic_pen'],
    scope: 'my_damage',
    when: (c) => c.tanks.length >= 2,
    reason: (c, names) => `Penetração: ${names(c.tanks)} são tanques.`,
  },
];
