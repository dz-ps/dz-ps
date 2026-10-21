import type { LlmClient, LlmRequest, LlmResult } from '../riftbuild-shared/ai/orchestrator.ts';

/** Deterministic LLM for tests and replay evals: returns recorded responses in order, streamed in chunks. */
export function replayClient(
  responses: (unknown | { stopReason: string })[],
  chunk = 23,
): LlmClient & { requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  return {
    requests,
    async streamJson(req, onText): Promise<LlmResult> {
      requests.push(req);
      const next = responses[Math.min(requests.length - 1, responses.length - 1)];
      if (next && typeof next === 'object' && 'stopReason' in (next as Record<string, unknown>)) {
        return {
          text: '',
          stopReason: (next as { stopReason: string }).stopReason,
          usage: {},
          model: 'replay',
        };
      }
      const text = typeof next === 'string' ? next : JSON.stringify(next);
      for (let i = 0; i < text.length; i += chunk) {
        if (req.signal?.aborted) throw new DOMException('aborted', 'AbortError');
        onText(text.slice(i, i + chunk));
        await Promise.resolve();
      }
      return {
        text,
        stopReason: 'end_turn',
        usage: { input_tokens: 1000, output_tokens: 300 },
        model: 'replay',
      };
    },
  };
}
