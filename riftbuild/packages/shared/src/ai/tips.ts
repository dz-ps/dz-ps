import { displayName, type CatalogIndex } from '../catalog/index.ts';
import { trendingByRole } from '../meta/trending.ts';
import { AiMetaTips } from '../schemas/ai.ts';
import type { Role } from '../schemas/common.ts';
import type { MetaBundle } from '../schemas/meta.ts';

// "Campeões em alta" tips (spec §5.3): generated once per patch and role, then served from cache.
export const TIPS_PROMPT_VERSION = 'tips-v1';
const MAX_PER_LIST = 3;
const MAX_TIP_CHARS = 160;

export const tipsCacheKey = (patch: string, role: Role) => `tips:${patch}:${role}`;

/** Champions that get tips for a role: the same "em alta" selection as the Home screen, top 3. */
export function tipChampions(index: CatalogIndex, meta: MetaBundle | null, role: Role): string[] {
  return trendingByRole(meta, index, { roles: [role], perRole: 3 }).map((s) => s.champion_id);
}

export function buildTipsSystemPrompt(patch: string): string {
  return [
    `Você é um treinador de League of Legends: Wild Rift, patch ${patch}.`,
    '- Use só as habilidades e itens informados no pedido. Ignore o LoL de PC: kits, itens e números são diferentes.',
    '- Nunca invente números (dano, tempo de recarga, porcentagens). Se precisar de algo que não está no pedido, registre em missing_data.',
    `- Para cada campeão: até ${MAX_PER_LIST} power spikes, ${MAX_PER_LIST} combos (use as teclas P/Q/W/E/R) e ${MAX_PER_LIST} erros comuns.`,
    `- Frases curtas (até ${MAX_TIP_CHARS} caracteres), em português do Brasil informal.`,
  ].join('\n');
}

export function buildTipsUserMessage(
  index: CatalogIndex,
  meta: MetaBundle | null,
  role: Role,
  ids: string[],
): string {
  return JSON.stringify({
    patch: index.patch,
    rota: role,
    campeoes: ids.map((id) => {
      const c = index.champions.get(id)!;
      const build = meta?.builds.find((b) => b.champion_id === id && b.role === role);
      return {
        id,
        nome: displayName(c),
        classes: c.classes,
        tags: c.tags.map((t) => t.tag),
        habilidades: c.abilities.map((a) => ({
          tecla: a.key,
          nome: a.name_pt ?? a.name_en,
          descricao: a.description_en.slice(0, 400),
        })),
        build_popular: build?.core_items
          .map((i) => index.items.get(i))
          .filter((i) => !!i)
          .map((i) => i!.name_en),
      };
    }),
  });
}

/** Structured-output schema: champion_id is limited to the champions we asked about. */
export function tipsOutputSchema(ids: string[]): Record<string, unknown> {
  const list = { type: 'array', items: { type: 'string' } };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['patch', 'role', 'tips', 'missing_data'],
    properties: {
      patch: { type: 'string' },
      role: { type: 'string' },
      tips: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['champion_id', 'power_spikes', 'combos', 'common_mistakes'],
          properties: {
            champion_id: { type: 'string', enum: ids },
            power_spikes: list,
            combos: list,
            common_mistakes: list,
          },
        },
      },
      missing_data: list,
    },
  };
}

/**
 * Same rule as the draft: nothing reaches the screen unless its ID is one we asked about and exists in the
 * catalog. Lists are trimmed and empty tips dropped. Returns null when the payload is not usable at all.
 */
export function validateTips(
  raw: unknown,
  ctx: { index: CatalogIndex; role: Role; allowed?: string[]; requirePatch?: boolean },
): AiMetaTips | null {
  const parsed = AiMetaTips.safeParse(raw);
  if (!parsed.success) return null;
  // The app only shows tips generated for the catalog patch it has (never last patch's advice).
  if (ctx.requirePatch && (parsed.data.patch !== ctx.index.patch || parsed.data.role !== ctx.role))
    return null;
  const allowed = new Set(ctx.allowed ?? [...ctx.index.champions.keys()]);
  const clean = (list: string[]) =>
    list
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= MAX_TIP_CHARS)
      .slice(0, MAX_PER_LIST);
  const seen = new Set<string>();
  const tips = parsed.data.tips
    .filter((t) => allowed.has(t.champion_id) && ctx.index.champions.has(t.champion_id))
    .filter((t) => {
      if (seen.has(t.champion_id)) return false;
      seen.add(t.champion_id);
      return true;
    })
    .map((t) => ({
      champion_id: t.champion_id,
      power_spikes: clean(t.power_spikes),
      combos: clean(t.combos),
      common_mistakes: clean(t.common_mistakes),
    }))
    .filter((t) => t.power_spikes.length + t.combos.length + t.common_mistakes.length > 0);
  return {
    patch: ctx.index.patch,
    role: ctx.role,
    tips,
    missing_data: clean(parsed.data.missing_data),
  };
}
