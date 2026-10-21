import type { CcType, ChampionTag, ItemCategory, Role, RunePath, StatKey } from '@riftbuild/shared';

// UI labels in pt-BR (interface text, not game data names).
export const ROLE_LABEL: Record<Role, string> = {
  baron: 'Barão',
  jungle: 'Selva',
  mid: 'Meio',
  dragon: 'Dragão',
  support: 'Suporte',
};

export const CLASS_LABEL: Record<string, string> = {
  tank: 'Tanque',
  fighter: 'Lutador',
  mage: 'Mago',
  assassin: 'Assassino',
  marksman: 'Atirador',
  support: 'Suporte',
};

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  physical: 'Físico',
  magic: 'Mágico',
  defense: 'Defesa',
  support: 'Suporte',
  boots: 'Botas',
  component: 'Componentes',
};

export const PATH_LABEL: Record<RunePath, string> = {
  domination: 'Dominação',
  precision: 'Precisão',
  resolve: 'Determinação',
  sorcery: 'Feitiçaria',
};

export const TAG_LABEL: Record<ChampionTag, string> = {
  tank: 'Tanque',
  engage: 'Iniciação',
  poke: 'Poke',
  heal: 'Cura',
  shield: 'Escudo',
  hard_cc: 'Controle pesado',
  soft_cc: 'Controle leve',
  dash: 'Avanço',
  invulnerability: 'Invulnerabilidade',
  projectile_reflect: 'Bloqueio de projéteis',
  execute: 'Execução',
  scaling: 'Escalonamento',
};

export const CC_LABEL: Record<CcType, string> = {
  stun: 'atordoamento',
  airborne: 'arremesso',
  suppression: 'supressão',
  root: 'enraizamento',
  charm: 'encanto',
  fear: 'medo',
  taunt: 'provocação',
  sleep: 'sono',
  polymorph: 'metamorfose',
  slow: 'lentidão',
  silence: 'silêncio',
  blind: 'cegueira',
  ground: 'aterramento',
  cripple: 'debilitação',
};

export const STAT_LABEL: Record<StatKey, string> = {
  ad: 'Dano de Ataque',
  ap: 'Poder de Habilidade',
  hp: 'Vida',
  armor: 'Armadura',
  mr: 'Resistência Mágica',
  attack_speed: 'Velocidade de Ataque',
  crit: 'Chance de Crítico',
  ability_haste: 'Aceleração de Habilidade',
  move_speed: 'Velocidade de Movimento',
  move_speed_pct: 'Velocidade de Movimento',
  armor_pen: 'Penetração de Armadura',
  armor_pen_pct: 'Penetração de Armadura',
  magic_pen: 'Penetração Mágica',
  magic_pen_pct: 'Penetração Mágica',
  lifesteal: 'Roubo de Vida',
  omnivamp: 'Omnivampirismo',
  heal_shield_power: 'Poder de Cura e Escudo',
  tenacity: 'Tenacidade',
  mana: 'Mana',
  mana_regen: 'Regeneração de Mana',
  hp_regen: 'Regeneração de Vida',
};

const PERCENT: ReadonlySet<StatKey> = new Set([
  'attack_speed',
  'crit',
  'lifesteal',
  'omnivamp',
  'tenacity',
  'armor_pen_pct',
  'magic_pen_pct',
  'heal_shield_power',
  'move_speed_pct',
]);

export function formatStat(key: StatKey, value: number): string {
  const n = Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
  return `+${n}${PERCENT.has(key) ? '%' : ''} ${STAT_LABEL[key]}`;
}

export const ABILITY_KEY_LABEL: Record<string, string> = {
  P: 'Passiva',
  Q: '1',
  W: '2',
  E: '3',
  R: 'Ult',
};

export const CHANGE_LABEL = { buff: 'Buff', nerf: 'Nerf', change: 'Ajuste' } as const;

export function formatDate(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}
