import Anthropic from '@anthropic-ai/sdk';
import type { LlmClient, LlmRequest, LlmResult } from '../riftbuild-shared/ai/orchestrator.ts';

export type AnthropicOptions = {
  apiKey: string;
  model: string;
  maxTokens: number;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Server-side refusal fallback (Claude API): opt-in by default for Opus/Sonnet/Fable models. */
  serverFallbacks: 'default' | 'off';
  timeoutMs: number;
};

const supportsServerFallback = (model: string) => /^claude-(opus|sonnet|fable)/.test(model);

/**
 * Structured output via output_config.format (JSON Schema), streamed as text deltas. The large static system
 * prompt (catalog digest + rules) is marked cacheable; only the per-request payload changes.
 */
export function anthropicClient(opts: AnthropicOptions): LlmClient {
  const client = new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs, maxRetries: 1 });
  return {
    async streamJson(req: LlmRequest, onText: (delta: string) => void): Promise<LlmResult> {
      const params = {
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: [
          {
            type: 'text' as const,
            text: req.system,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        messages: req.messages,
        output_config: {
          effort: opts.effort,
          format: { type: 'json_schema' as const, schema: req.schema },
        },
      };
      const useFallback = opts.serverFallbacks === 'default' && supportsServerFallback(opts.model);
      const stream = useFallback
        ? client.beta.messages.stream(
            {
              ...params,
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
            } as unknown as Parameters<typeof client.beta.messages.stream>[0],
            { signal: req.signal },
          )
        : client.messages.stream(
            params as unknown as Parameters<typeof client.messages.stream>[0],
            { signal: req.signal },
          );

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
        stop_reason: string | null;
        model: string;
        usage: Record<string, number | null | undefined>;
      };
      return {
        text,
        stopReason: final.stop_reason,
        model: final.model,
        usage: {
          input_tokens: final.usage.input_tokens ?? undefined,
          output_tokens: final.usage.output_tokens ?? undefined,
          cache_read_input_tokens: final.usage.cache_read_input_tokens ?? undefined,
          cache_creation_input_tokens: final.usage.cache_creation_input_tokens ?? undefined,
        },
      };
    },
  };
}
