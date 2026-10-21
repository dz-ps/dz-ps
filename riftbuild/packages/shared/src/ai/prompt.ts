import { displayName, type CatalogIndex } from '../catalog/index.ts';
import type { Candidates } from '../comp/candidates.ts';
import type { CompRead } from '../comp/compAnalyzer.ts';
import type { DraftInput } from '../schemas/ai.ts';
import type { Champion } from '../schemas/catalog.ts';

export const PROMPT_VERSION = 'draft-v1';

/**
 * Static, per-patch system prompt (cacheable). Rules from spec §6.3, in pt-BR.
 * The catalog digest lists every ID the model may use; anything else is rejected by the validator.
 */
export function buildSystemPrompt(index: CatalogIndex): string {
  const rules = index.rules;
  const items = [...index.items.values()]
    .filter((i) => i.tier >= 2 || i.category === rules.boots_category)
    .map((i) => `${i.id}|${i.name_en}|${i.category}|${i.cost ?? '-'}|${i.tags.join(',')}`)
    .join('\n');
  const runes = [...index.runes.values()]
    .map((r) => `${r.id}|${r.kind}|${r.path ?? '-'}|${r.slot ?? '-'}`)
    .join('\n');
  const spells = [...index.spells.values()]
    .filter((s) => s.selectable)
    .map((s) => `${s.id}|${s.jungle_only ? 'selva' : 'todas'}`)
    .join('\n');
  const champions = [...index.champions.values()]
    .map((c) => `${c.id}|${displayName(c)}`)
    .join('\n');
  return [
    `Você é um analista de League of Legends: Wild Rift, patch ${index.patch}.`,
    'Regras obrigatórias:',
    '- Use apenas os IDs das listas abaixo. Ignore qualquer conhecimento de LoL de PC: itens, runas e valores do PC são diferentes.',
    '- Nunca invente números. Os números da leitura da composição vêm prontos no pedido; se faltar dado, preencha missing_data.',
    '- Explique cada recomendação em uma frase curta, em português do Brasil informal.',
    `- Regras de build: no máximo ${rules.item_slots} itens contando a bota; só ${rules.boots_max} bota (campo boots); passivas únicas com o mesmo nome não acumulam; respeite limites de itens.`,
    `- Página de runas: ${rules.rune_page.keystones} runa-chave, uma runa de cada slot ${rules.rune_page.primary_slots.join('/')} da árvore primária (primary, em ordem de slot) e ${rules.rune_page.secondary_count} runa de outra árvore (secondary).`,
    `- Feitiços: exatamente 2, diferentes.${rules.jungle_requires_spell ? ` Na selva, ${rules.jungle_requires_spell} é obrigatório; fora da selva, feitiços de selva são proibidos.` : ''}`,
    '- Foque no que muda em relação à build padrão por causa da composição inimiga.',
    '- comp_read.threats e game_plan devem citar campeões inimigos; counter_picks e bans não podem repetir campeões já escolhidos.',
    '',
    'ITENS (id|nome|categoria|custo|tags):',
    items,
    '',
    'RUNAS (id|tipo|árvore|slot):',
    runes,
    '',
    'FEITIÇOS (id|uso):',
    spells,
    '',
    'CAMPEÕES (id|nome):',
    champions,
  ].join('\n');
}

function championBrief(c: Champion) {
  return {
    id: c.id,
    nome: displayName(c),
    classes: c.classes,
    rotas: c.roles,
    tags: c.tags.map((t) => t.tag),
    habilidades: c.abilities.map((a) => ({
      tecla: a.key,
      nome: a.name_en,
      dano: a.damage_types,
      controle: a.cc_types,
      resumo: a.description_en.slice(0, 220),
    })),
  };
}

/** Per-request payload: only what the model needs (spec §6.1 step 2). */
export function buildDraftUserMessage(
  input: DraftInput,
  index: CatalogIndex,
  comp: CompRead,
  candidates: Candidates,
): string {
  const champ = (id: string) => index.champions.get(id);
  const payload = {
    patch: index.patch,
    minha_rota: input.my_role,
    meu_campeao: input.my_champion ? championBrief(champ(input.my_champion)!) : null,
    estilo: input.style,
    elo: input.elo,
    inimigos: input.enemies.map((id) => championBrief(champ(id)!)),
    aliados: input.allies.map((id) => ({ id, nome: displayName(champ(id)!) })),
    leitura_da_composicao: {
      dano: comp.damage,
      controle_pesado: comp.hardCcCount,
      fontes_de_controle: comp.ccSources.map(
        (s) => `${s.championId} ${s.abilityKey} (${s.types.join(', ')})`,
      ),
      cura: comp.healing,
      curandeiros: comp.healers,
      escudos: comp.shielders,
      iniciadores: comp.engage,
      invulnerabilidade: comp.invulnerable,
      bloqueio_de_projeteis: comp.projectileBlock,
      ameacas: comp.threats,
    },
    itens_candidatos: candidates.groups.map((g) => ({ motivo: g.reason_pt, ids: g.itemIds })),
    tipo_de_dano_da_build: candidates.buildDamage,
    build_meta: candidates.metaBuild,
    confrontos_conhecidos: [],
  };
  return [
    'Analise este draft e responda no formato JSON pedido.',
    'Se meu_campeao for null, deixe build.items vazio e foque em counter_picks para minha_rota.',
    JSON.stringify(payload),
  ].join('\n');
}

export function buildRetryMessage(errors: string): string {
  return `Sua resposta anterior tinha erros de validação:\n${errors}\nCorrija e devolva o JSON completo, usando só IDs das listas.`;
}
