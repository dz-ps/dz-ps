import { DRAFT_SECTIONS, type AiDraftResponse, type DraftSection } from '../schemas/ai.ts';
import { JsonSectionStream } from './jsonSections.ts';
import { buildRetryMessage } from './prompt.ts';
import {
  describeProblems,
  emptySection,
  validateSection,
  type AiProblem,
  type DraftContext,
} from './validateAi.ts';

/** Provider-agnostic LLM interface; the Anthropic SDK adapter lives in the Edge Function (and evals). */
export type LlmMessage = { role: 'user' | 'assistant'; content: string };
export type LlmUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};
export type LlmResult = { text: string; stopReason: string | null; usage: LlmUsage; model: string };
export type LlmRequest = {
  system: string;
  messages: LlmMessage[];
  schema: Record<string, unknown>;
  signal?: AbortSignal;
};
export interface LlmClient {
  /** Streams JSON text deltas through onText and resolves with the final message. */
  streamJson(request: LlmRequest, onText: (delta: string) => void): Promise<LlmResult>;
}

export type SectionEvent = {
  name: DraftSection;
  data: unknown;
  attempt: number;
  replaces?: boolean;
};

export type DraftRunResult = {
  response: AiDraftResponse;
  incomplete: boolean;
  removed: AiProblem[];
  attempts: number;
  usage: LlmUsage[];
  stopReason: string | null;
  refused: boolean;
  firstSectionMs: number | null;
  model: string | null;
};

export type DraftRunInput = {
  llm: LlmClient;
  ctx: DraftContext;
  system: string;
  userMessage: string;
  schema: Record<string, unknown>;
  onSection?: (event: SectionEvent) => void;
  signal?: AbortSignal;
  now?: () => number;
};

/**
 * Draft analysis flow (spec §6.1-6.5): stream, validate each top-level section as soon as it closes and emit
 * only clean sections; one automatic retry with the validation errors in context; anything still invalid is
 * removed and the response is marked incomplete. Raw model output never reaches the caller.
 */
export async function runDraft(input: DraftRunInput): Promise<DraftRunResult> {
  const now = input.now ?? (() => Date.now());
  const started = now();
  let firstSectionMs: number | null = null;
  const accepted = new Map<DraftSection, unknown>();
  const failed = new Map<DraftSection, AiProblem[]>();
  const usage: LlmUsage[] = [];
  let lastText = '';
  let stopReason: string | null = null;
  let model: string | null = null;
  let extras: { confidence?: unknown; missing_data?: unknown } = {};

  const emit = (name: DraftSection, data: unknown, attempt: number, replaces = false) => {
    if (firstSectionMs === null) firstSectionMs = now() - started;
    input.onSection?.({ name, data, attempt, ...(replaces ? { replaces } : {}) });
  };

  const attempt = async (n: number, messages: LlmMessage[]) => {
    const parser = new JsonSectionStream();
    const onKey = ([key, value]: [string, unknown]) => {
      if (key === 'confidence' || key === 'missing_data') {
        extras = { ...extras, [key]: value };
        return;
      }
      if (!(DRAFT_SECTIONS as readonly string[]).includes(key)) return;
      const section = key as DraftSection;
      if (n > 1 && accepted.has(section) && !failed.has(section)) return; // keep what already passed
      const result = validateSection(section, value, input.ctx);
      if (result.problems.length === 0 && result.value !== null) {
        accepted.set(section, result.value);
        failed.delete(section);
        emit(section, result.value, n, n > 1);
      } else {
        failed.set(section, result.problems);
        if (result.value !== null) accepted.set(section, result.value); // keep partial; may be replaced
      }
    };
    const result = await input.llm.streamJson(
      { system: input.system, messages, schema: input.schema, signal: input.signal },
      (delta) => parser.push(delta).forEach(onKey),
    );
    usage.push(result.usage);
    stopReason = result.stopReason;
    model = result.model;
    lastText = result.text;
    if (result.stopReason === 'refusal') return false;
    for (const section of DRAFT_SECTIONS) {
      if (!accepted.has(section) && !failed.has(section)) {
        failed.set(section, [
          { section, path: section, code: 'MISSING', message: 'seção ausente na resposta' },
        ]);
      }
    }
    return true;
  };

  const baseMessages: LlmMessage[] = [{ role: 'user', content: input.userMessage }];
  const completed = await attempt(1, baseMessages);
  if (!completed) return finish(1, true);

  let attempts = 1;
  if (failed.size > 0 && !input.signal?.aborted) {
    attempts = 2;
    const problems = [...failed.values()].flat();
    await attempt(2, [
      ...baseMessages,
      { role: 'assistant', content: lastText || '{}' },
      { role: 'user', content: buildRetryMessage(describeProblems(problems)) },
    ]);
  }
  return finish(attempts, stopReason === 'refusal');

  function finish(attemptsMade: number, refused: boolean): DraftRunResult {
    const removed = [...failed.values()].flat();
    // Sections that still failed: emit the stripped (validated) remainder so the UI shows what survived.
    for (const [section] of failed) {
      const value = accepted.get(section) ?? emptySection(section, input.ctx);
      accepted.set(section, value);
      emit(section, value, attemptsMade, true);
    }
    // Refused or cut off before a section arrived: fill with empty values (never shown as AI content).
    for (const section of DRAFT_SECTIONS) {
      if (!accepted.has(section)) accepted.set(section, emptySection(section, input.ctx));
    }
    const build = accepted.get('build') as AiDraftResponse['build'];
    const missing = new Set<string>(
      Array.isArray(extras.missing_data)
        ? (extras.missing_data as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
    );
    if (!build.runes) missing.add('runes');
    if (!build.spells) missing.add('spells');
    const confidence = extras.confidence;
    const response: AiDraftResponse = {
      patch: input.ctx.index.patch,
      comp_read: accepted.get('comp_read') as AiDraftResponse['comp_read'],
      build,
      counter_picks: accepted.get('counter_picks') as AiDraftResponse['counter_picks'],
      bans: accepted.get('bans') as AiDraftResponse['bans'],
      game_plan: accepted.get('game_plan') as string[],
      confidence:
        confidence === 'alta' || confidence === 'media' || confidence === 'baixa'
          ? confidence
          : 'baixa',
      missing_data: [...missing],
    };
    return {
      response,
      incomplete: removed.length > 0 || refused,
      removed,
      attempts: attemptsMade,
      usage,
      stopReason,
      refused,
      firstSectionMs,
      model,
    };
  }
}
