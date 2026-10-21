import {
  itemIssues,
  type AiDraftResponse,
  type BanSuggestion,
  type Candidates,
  type CatalogIndex,
  type CompRead,
  type CounterPick,
  type ItemTag,
} from '../../packages/shared/src/index.ts';

export type Case = {
  id: string;
  title: string;
  mandatory?: boolean;
  input: {
    enemies_text?: string;
    allies_text?: string;
    my_champion?: string;
    role?: string;
    style?: string[];
  };
  deterministic?: Record<string, unknown>;
  ai?: Record<string, unknown>;
};

export type Outcome = {
  id: string;
  mandatory: boolean;
  status: 'pass' | 'fail' | 'skipped';
  failures: string[];
  skipped: string[];
};

type Det = {
  comp: CompRead;
  candidates: Candidates;
  counters: CounterPick[];
  bans: BanSuggestion[];
  picked: string[];
};
type Ctx = {
  index: CatalogIndex;
  mode: string;
  parsedIds: string[];
  invalid: string | null;
  det: Det | null;
  ai: AiDraftResponse | null;
  aiRaw: AiDraftResponse | null;
  aiError: string | null;
};

const HEALING = ['nenhuma', 'baixa', 'media', 'alta'];
const re = (pattern: string) => new RegExp(pattern, 'i');

export function grade(c: Case, ctx: Ctx): Outcome {
  const failures: string[] = [];
  const skipped: string[] = [];
  const check = (ok: boolean, message: string) => {
    if (!ok) failures.push(message);
  };
  const det = ctx.det;
  let graded = 0;

  for (const [key, expected] of Object.entries(c.deterministic ?? {})) {
    graded++;
    if (key === 'expect_invalid_input') {
      check(ctx.invalid !== null, 'expected the input to be rejected');
      continue;
    }
    if (key === 'parsed_ids') {
      check(
        JSON.stringify(ctx.parsedIds) === JSON.stringify(expected),
        `parsed ${JSON.stringify(ctx.parsedIds)}`,
      );
      continue;
    }
    if (!det) {
      failures.push(`invalid input: ${ctx.invalid}`);
      continue;
    }
    const comp = det.comp;
    const rules = det.candidates.groups.map((g) => g.ruleId);
    switch (key) {
      case 'healers_include':
        check(
          (expected as string[]).every((id) => comp.healers.includes(id)),
          `healers ${comp.healers}`,
        );
        break;
      case 'healing_at_least':
        check(
          HEALING.indexOf(comp.healing) >= HEALING.indexOf(expected as string),
          `healing ${comp.healing}`,
        );
        break;
      case 'hard_cc_at_least':
        check(comp.hardCcCount >= (expected as number), `hard CC ${comp.hardCcCount}`);
        break;
      case 'magic_share_above':
        check(comp.damage.magic > (expected as number), `magic share ${comp.damage.magic}`);
        break;
      case 'physical_share_above':
        check(
          comp.damage.physical > (expected as number),
          `physical share ${comp.damage.physical}`,
        );
        break;
      case 'candidate_rules_include':
        check(
          (expected as string[]).every((r) => rules.includes(r)),
          `candidate rules ${rules}`,
        );
        break;
      case 'candidate_rules_exclude':
        check(
          (expected as string[]).every((r) => !rules.includes(r)),
          `candidate rules ${rules}`,
        );
        break;
      case 'threats_include':
        check(
          (expected as string[]).every((id) => comp.threats.some((t) => t.championId === id)),
          `threats ${comp.threats.map((t) => t.championId)}`,
        );
        break;
      case 'poke_at_least':
        check(comp.poke.length >= (expected as number), `poke ${comp.poke}`);
        break;
      case 'dashes_at_least':
        check(comp.dashes.length >= (expected as number), `dashes ${comp.dashes}`);
        break;
      case 'tanks_at_least':
        check(comp.tanks.length >= (expected as number), `tanks ${comp.tanks}`);
        break;
      case 'invulnerable_at_least':
        check(
          comp.invulnerable.length >= (expected as number),
          `invulnerable ${comp.invulnerable}`,
        );
        break;
      case 'enemy_count':
        check(comp.championIds.length === expected, `enemies ${comp.championIds.length}`);
        break;
      case 'counters_count_at_least':
        check(det.counters.length >= (expected as number), `counters ${det.counters.length}`);
        break;
      case 'bans_exclude_picked':
        check(
          det.bans.every((b) => !det.picked.includes(b.championId)),
          'deterministic bans include a picked champion',
        );
        break;
      case 'build_damage':
        check(
          det.candidates.buildDamage === expected,
          `build damage ${det.candidates.buildDamage}`,
        );
        break;
      default:
        failures.push(`unknown deterministic assertion ${key}`);
    }
  }

  if (ctx.mode !== 'deterministic' && c.ai) {
    if (ctx.aiError || !ctx.ai || !ctx.aiRaw) {
      graded++;
      failures.push(`AI: ${ctx.aiError ?? 'no response'}`);
    } else {
      const ai = ctx.ai;
      const raw = ctx.aiRaw;
      const { index } = ctx;
      const itemTags = ai.build.items.map((i) => index.items.get(i.id)!.tags);
      const bootsTags = ai.build.boots ? index.items.get(ai.build.boots.id)!.tags : [];
      const plan = ai.game_plan.join(' \n ');
      const anyItemWith = (tags: string[]) =>
        [...index.items.values()].some((i) => tags.some((t) => i.tags.includes(t as ItemTag)));
      for (const [key, expected] of Object.entries(c.ai)) {
        graded++;
        switch (key) {
          case 'item_tags_any': {
            const tags = expected as string[];
            if (!anyItemWith(tags)) skipped.push(`no catalog item has ${tags}`);
            else
              check(
                itemTags.some((t) => tags.some((x) => t.includes(x as ItemTag))),
                `no item with ${tags}`,
              );
            break;
          }
          case 'item_or_boots_tags_any': {
            const tags = expected as string[];
            check(
              [...itemTags, bootsTags].some((t) => tags.some((x) => t.includes(x as ItemTag))),
              `no item/boots with ${tags}`,
            );
            break;
          }
          case 'boots_tags_all': {
            const tags = expected as string[];
            const exists = [...index.items.values()].some(
              (i) =>
                i.category === index.rules.boots_category &&
                tags.every((t) => i.tags.includes(t as ItemTag)),
            );
            if (!exists) skipped.push(`no boots with all of ${tags}`);
            else
              check(
                tags.every((t) => bootsTags.includes(t as ItemTag)),
                `boots ${ai.build.boots?.id ?? 'none'} lack ${tags}`,
              );
            break;
          }
          case 'item_tags_majority': {
            const tag = (expected as string[])[0] as ItemTag;
            check(
              itemTags.filter((t) => t.includes(tag)).length > itemTags.length / 2,
              `fewer than half of the items have ${tag}`,
            );
            break;
          }
          case 'spells_include':
            check(
              (expected as string[]).every((s) => ai.build.spells?.includes(s)),
              `spells ${ai.build.spells}`,
            );
            break;
          case 'spells_exclude_jungle_only':
            check(
              !(ai.build.spells ?? []).some((s) => index.spells.get(s)?.jungle_only),
              `jungle spell outside the jungle: ${ai.build.spells}`,
            );
            break;
          case 'plan_mentions_all':
            check(
              (expected as string[]).every((p) => re(p).test(plan)),
              `plan misses ${expected}`,
            );
            break;
          case 'plan_mentions_any':
            check(
              (expected as string[]).some((p) => re(p).test(plan)),
              `plan mentions none of ${expected}`,
            );
            break;
          case 'plan_mentions_any_group': {
            // Every group must match within ONE plan line (e.g. "não use o R na Mel com o W disponível").
            const groups = expected as string[][];
            check(
              ai.game_plan.some((line) => groups.every((g) => g.some((p) => re(p).test(line)))),
              `no plan line matches all of ${JSON.stringify(groups)}`,
            );
            break;
          }
          case 'no_invalid_ids': {
            const ids = [
              ...raw.build.items.map((i) => i.id),
              ...(raw.build.boots ? [raw.build.boots.id] : []),
            ];
            const champs = [
              ...raw.bans.map((b) => b.champion_id),
              ...raw.counter_picks.map((c) => c.champion_id),
            ];
            const bad = [
              ...ids.filter((id) => !index.items.has(id)),
              ...champs.filter((id) => !index.champions.has(id)),
            ];
            check(bad.length === 0, `ids outside the catalog: ${bad}`);
            break;
          }
          case 'no_unique_overlap': {
            const ids = [
              ...raw.build.items.map((i) => i.id),
              ...(raw.build.boots ? [raw.build.boots.id] : []),
            ].filter((id) => index.items.has(id));
            check(
              !itemIssues(ids, index).some((i) => i.code === 'UNIQUE_GROUP_OVERLAP'),
              'two items share a unique passive',
            );
            break;
          }
          case 'boots_max': {
            const ids = [
              ...raw.build.items.map((i) => i.id),
              ...(raw.build.boots ? [raw.build.boots.id] : []),
            ];
            check(
              ids.filter((id) => index.items.get(id)?.category === index.rules.boots_category)
                .length <= (expected as number),
              'more than one pair of boots',
            );
            break;
          }
          case 'counter_picks_at_least':
            check(
              ai.counter_picks.length >= (expected as number),
              `counter picks ${ai.counter_picks.length}`,
            );
            break;
          case 'counter_picks_role':
            check(
              ai.counter_picks.every((c) => c.role === expected),
              'counter pick for another role',
            );
            break;
          case 'bans_exclude_picked':
            check(
              raw.bans.every((b) => !(ctx.det?.picked ?? []).includes(b.champion_id)),
              'AI ban repeats a picked champion',
            );
            break;
          default:
            failures.push(`unknown AI assertion ${key}`);
        }
      }
    }
  }

  const status = graded === 0 ? 'skipped' : failures.length ? 'fail' : 'pass';
  return { id: c.id, mandatory: !!c.mandatory, status, failures, skipped };
}
