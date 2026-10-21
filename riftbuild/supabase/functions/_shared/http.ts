import { encodeSse } from './riftbuild-shared/sse.ts';

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers':
    'authorization, x-client-info, apikey, content-type, accept, x-device-id',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export type ErrorCode =
  | 'rate_limited'
  | 'ai_unavailable'
  | 'ai_refused'
  | 'invalid_input'
  | 'timeout'
  | 'config'
  | 'unauthorized'
  | 'not_found';

export function errorBody(code: ErrorCode, message_pt: string) {
  return { error: { code, message_pt } };
}

/** SSE response whose body is produced by `run(send)`; the stream closes when run settles. */
export function sse(
  run: (send: (event: string, data: unknown) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(encodeSse(event, data)));
      try {
        await run(send);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      ...CORS,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}
