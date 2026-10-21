// Draft evals (spec §6.6). Usage:
//   node src/run.ts --mode=deterministic   instant read + candidate rules only (CI, no key)
//   node src/run.ts --mode=replay          grades recordings/*.json (previous local/remote runs)
//   node src/run.ts --mode=local           calls Claude directly with the shared orchestrator (ANTHROPIC_API_KEY, AI_MODEL_DRAFT)
//   node src/run.ts --mode=remote          calls the deployed Edge Function (RIFTBUILD_FUNCTIONS_URL, RIFTBUILD_ACCESS_TOKEN)
// Exit codes: 0 pass (>= 90% and mandatory case), 1 fail, 2 BLOCKED (no real catalog / missing credentials).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  analyzeComp,
  buildDraftUserMessage,
  buildSystemPrompt,
  CatalogBundle,
  championSearchIndex,
  draftOutputSchema,
  indexCatalog,
  MetaBundle,
  parseChampions,
  runDraft,
  selectCandidates,
  suggestBans,
  suggestCounterPicks,
  validateAiDraft,
  type AiDraftResponse,
  type CatalogIndex,
  type DraftInput,
  type LlmClient,
  type MetaBundle as Meta,
  type Role,
} from '../../packages/shared/src/index.ts';
import { grade, type Case, type Outcome } from './graders.ts';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const here = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mode = (process.argv.find((a) => a.startsWith('--mode='))?.slice(7) ?? 'deterministic') as
  'deterministic' | 'replay' | 'local' | 'remote';
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

function blocked(reason: string): never {
  console.log(`BLOCKED: ${reason}`);
  process.exit(2);
}

function loadCatalog(): { index: CatalogIndex; meta: Meta | null } {
  const path = process.env.RIFTBUILD_CATALOG ?? join(root, 'pipeline/out/catalog/latest.json');
  if (!existsSync(path))
    blocked(`no real catalog at ${path} (run the pipeline first; evals never run on fixtures)`);
  const bundle = CatalogBundle.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (bundle.fixture) blocked('catalog is a fixture bundle');
  const metaPath = path.replace(/catalog\/latest\.json$/, 'meta/latest.json');
  const meta = existsSync(metaPath)
    ? MetaBundle.parse(JSON.parse(readFileSync(metaPath, 'utf8')))
    : null;
  return { index: indexCatalog(bundle), meta };
}

const { index, meta } = loadCatalog();
const search = championSearchIndex(index);
const cases = (parseYaml(readFileSync(join(here, 'cases.yaml'), 'utf8')) as Case[]).filter(
  (c) => !only || c.id === only,
);

function toInput(c: Case): {
  input: DraftInput | null;
  parsedIds: string[];
  invalid: string | null;
} {
  const enemies = parseChampions(c.input.enemies_text ?? '', search, 5).resolved.map((r) => r.id);
  const allies = c.input.allies_text
    ? parseChampions(c.input.allies_text, search, 4).resolved.map((r) => r.id)
    : [];
  const me = c.input.my_champion ?? null;
  const all = [...enemies, ...allies, ...(me ? [me] : [])];
  if (me && !index.champions.has(me))
    return { input: null, parsedIds: enemies, invalid: `my_champion ${me} not in catalog` };
  if (new Set(all).size !== all.length)
    return { input: null, parsedIds: enemies, invalid: 'duplicate champion' };
  return {
    parsedIds: enemies,
    invalid: null,
    input: {
      patch: index.patch,
      bundle_hash: null,
      enemies,
      allies,
      my_champion: me,
      my_role: (c.input.role as Role) ?? null,
      elo: meta?.rank_tiers[0] ?? null,
      style: c.input.style ?? [],
    },
  };
}

function anthropicLocal(): LlmClient {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.AI_MODEL_DRAFT;
  if (!key || !model) blocked('local mode needs ANTHROPIC_API_KEY and AI_MODEL_DRAFT');
  return {
    async streamJson(req, onText) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: key });
      const stream = client.messages.stream({
        model,
        max_tokens: Number(process.env.AI_MAX_TOKENS_DRAFT ?? 8000),
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: req.messages,
        output_config: {
          effort: (process.env.AI_EFFORT_DRAFT ?? 'low') as 'low',
          format: { type: 'json_schema', schema: req.schema },
        },
      } as never);
      let text = '';
      for await (const event of stream as AsyncIterable<{
        type: string;
        delta?: { type: string; text?: string };
      }>) {
        if (
          event.type === 'content_block_delta' &&
          event.delta?.type === 'text_delta' &&
          event.delta.text
        ) {
          text += event.delta.text;
          onText(event.delta.text);
        }
      }
      const final = (await stream.finalMessage()) as unknown as {
        stop_reason: string;
        model: string;
        usage: Record<string, number>;
      };
      return { text, stopReason: final.stop_reason, model: final.model, usage: final.usage };
    },
  };
}

async function remoteDraft(input: DraftInput): Promise<{ response: AiDraftResponse; ms: number }> {
  const url = process.env.RIFTBUILD_FUNCTIONS_URL;
  const token = process.env.RIFTBUILD_ACCESS_TOKEN;
  if (!url || !token)
    blocked('remote mode needs RIFTBUILD_FUNCTIONS_URL and RIFTBUILD_ACCESS_TOKEN');
  const t0 = Date.now();
  const res = await fetch(`${url.replace(/\/$/, '')}/ai/draft`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as { response?: AiDraftResponse; error?: { message_pt: string } };
  if (!body.response) throw new Error(body.error?.message_pt ?? `HTTP ${res.status}`);
  return { response: body.response, ms: Date.now() - t0 };
}

const outcomes: Outcome[] = [];
const latencies: number[] = [];
const recordingsDir = join(here, 'recordings');
mkdirSync(recordingsDir, { recursive: true });

for (const c of cases) {
  const { input, parsedIds, invalid } = toInput(c);
  const det = input
    ? (() => {
        const comp = analyzeComp(input.enemies, index, meta, input.elo);
        const candidates = selectCandidates({
          comp,
          myChampionId: input.my_champion,
          role: input.my_role,
          style: input.style,
          index,
        });
        const picked = [
          ...input.enemies,
          ...input.allies,
          ...(input.my_champion ? [input.my_champion] : []),
        ];
        return {
          comp,
          candidates,
          counters: input.my_role
            ? suggestCounterPicks(index, meta, input.my_role, input.elo, picked)
            : [],
          bans: suggestBans({
            index,
            meta,
            elo: input.elo,
            myRole: input.my_role,
            mains: [],
            lossLog: {},
            exclude: picked,
          }),
          picked,
        };
      })()
    : null;

  let ai: AiDraftResponse | null = null;
  let aiRaw: AiDraftResponse | null = null;
  let aiError: string | null = null;
  if (mode !== 'deterministic' && c.ai && input && det) {
    const recording = join(recordingsDir, `${c.id}.json`);
    try {
      if (mode === 'replay') {
        if (!existsSync(recording)) throw new Error('no recording');
        ai = JSON.parse(readFileSync(recording, 'utf8')) as AiDraftResponse;
      } else if (mode === 'local') {
        const t0 = Date.now();
        const result = await runDraft({
          llm: anthropicLocal(),
          ctx: {
            index,
            comp: det.comp,
            enemies: input.enemies,
            allies: input.allies,
            myChampionId: input.my_champion,
            role: input.my_role,
          },
          system: buildSystemPrompt(index),
          userMessage: buildDraftUserMessage(input, index, det.comp, det.candidates),
          schema: draftOutputSchema(index),
        });
        latencies.push(Date.now() - t0);
        ai = result.response;
      } else {
        const { response, ms } = await remoteDraft(input);
        latencies.push(ms);
        ai = response;
      }
      if (mode !== 'replay') writeFileSync(recording, JSON.stringify(ai, null, 1));
    } catch (err) {
      aiError = (err as Error).message;
    }
    // Replayed/remote answers are re-validated here too: graders never see an unvalidated id.
    aiRaw = ai;
    if (ai)
      ai = validateAiDraft(ai, {
        index,
        comp: det.comp,
        enemies: input.enemies,
        allies: input.allies,
        myChampionId: input.my_champion,
        role: input.my_role,
      }).response;
  }
  outcomes.push(grade(c, { index, mode, parsedIds, invalid, det, ai, aiRaw, aiError }));
}

const graded = outcomes.filter((o) => o.status !== 'skipped');
const passed = graded.filter((o) => o.status === 'pass');
const mandatory = outcomes.find((o) => o.mandatory);
const rate = graded.length ? passed.length / graded.length : 0;
for (const o of outcomes) {
  console.log(`${o.status.toUpperCase().padEnd(7)} ${o.id}${o.mandatory ? ' (obrigatório)' : ''}`);
  for (const f of o.failures) console.log(`        ✗ ${f}`);
  for (const s of o.skipped) console.log(`        ~ ${s}`);
}
const p50 = latencies.length
  ? [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length / 2)]
  : null;
const summary = {
  mode,
  patch: index.patch,
  cases: outcomes.length,
  graded: graded.length,
  passed: passed.length,
  rate: Math.round(rate * 1000) / 10,
  mandatory: mandatory?.status ?? 'missing',
  p50_ms: p50,
};
console.log(JSON.stringify(summary));
writeFileSync(join(here, `last-run-${mode}.json`), JSON.stringify({ summary, outcomes }, null, 1));
process.exit(rate >= 0.9 && mandatory?.status === 'pass' ? 0 : 1);
