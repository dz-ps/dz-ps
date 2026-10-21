import {
  SseParser,
  validateSection,
  type AiDraftResponse,
  type DraftContext,
  type DraftInput,
  type DraftSection,
} from '@riftbuild/shared';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { env } from '@/lib/env';
import { accessToken } from './supabase';

export type DraftStreamHandlers = {
  onMeta?: (meta: { cached: boolean; model: string | null; catalog_mismatch?: boolean }) => void;
  onSection: (name: DraftSection, data: unknown) => void;
  onDone: (done: { response: AiDraftResponse; incomplete: boolean }) => void;
  onError: (message: string, code: string) => void;
};

export type DraftStreamDeps = {
  fetchFn?: typeof fetch;
  token?: () => Promise<string | null>;
  baseUrl?: string;
};

/**
 * Calls /ai/draft and streams sections. Every section is validated AGAIN on the device with the same
 * shared validator before it reaches the screen (defense in depth: nothing unvalidated is ever shown).
 */
export async function streamDraft(
  input: DraftInput,
  ctx: DraftContext,
  handlers: DraftStreamHandlers,
  signal?: AbortSignal,
  deps: DraftStreamDeps = {},
): Promise<void> {
  const base =
    deps.baseUrl ?? (env.supabaseUrl ? `${env.supabaseUrl.replace(/\/$/, '')}/functions/v1` : null);
  if (!base) {
    handlers.onError('A análise com IA precisa do backend configurado.', 'config');
    return;
  }
  let token: string | null;
  try {
    token = await (deps.token ?? accessToken)();
  } catch {
    handlers.onError(
      'A análise com IA precisa de internet. A leitura instantânea acima funciona offline.',
      'network',
    );
    return;
  }
  const streaming = Platform.OS !== 'web' || typeof ReadableStream !== 'undefined';
  const fetchFn =
    deps.fetchFn ??
    (Platform.OS === 'web'
      ? (i: RequestInfo | URL, o?: RequestInit) => fetch(i, o)
      : (expoFetch as unknown as typeof fetch));
  let res: Response;
  try {
    res = await fetchFn(`${base}/ai/draft`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: streaming ? 'text/event-stream' : 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(env.supabaseAnonKey ? { apikey: env.supabaseAnonKey } : {}),
      },
      body: JSON.stringify(input),
      signal,
    });
  } catch {
    handlers.onError(
      'A análise com IA precisa de internet. A leitura instantânea acima funciona offline.',
      'network',
    );
    return;
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code: string; message_pt: string };
    } | null;
    handlers.onError(
      body?.error?.message_pt ?? 'A análise com IA falhou.',
      body?.error?.code ?? 'ai_unavailable',
    );
    return;
  }

  const handle = (event: string, data: unknown) => {
    if (event === 'meta') handlers.onMeta?.(data as never);
    else if (event === 'section') {
      const { name, data: value } = data as { name: DraftSection; data: unknown };
      const checked = validateSection(name, value, ctx);
      if (checked.value !== null) handlers.onSection(name, checked.value);
    } else if (event === 'done') {
      const done = data as { response: AiDraftResponse; incomplete: boolean };
      handlers.onDone(done);
    } else if (event === 'error') {
      const err = data as { code: string; message_pt: string };
      handlers.onError(err.message_pt, err.code);
    }
  };

  if (!res.body || !streaming) {
    const text = await res.text();
    if (text.trimStart().startsWith('{')) {
      const body = JSON.parse(text) as {
        response?: AiDraftResponse;
        incomplete?: boolean;
        error?: { code: string; message_pt: string };
      };
      if (body.response) {
        for (const name of ['comp_read', 'build', 'counter_picks', 'bans', 'game_plan'] as const)
          handle('section', { name, data: body.response[name] });
        handlers.onDone({ response: body.response, incomplete: !!body.incomplete });
      } else if (body.error) handlers.onError(body.error.message_pt, body.error.code);
      return;
    }
    new SseParser().push(text).forEach((e) => handle(e.event, e.data));
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true })).forEach((e) => handle(e.event, e.data));
  }
}
