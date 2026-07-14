/**
 * Anthropic → OpenAI streaming converter.
 *
 * Upstream `proxy/qwen3.7-max` (and any future brain with
 * `endpoint: "anthropic"`) emits Anthropic-format SSE events with
 * `event:` prefixes and `data:` payloads like `{"type":"ping"}` that
 * do not match the OpenAI `ChatCompletionChunk` schema. This module
 * converts the events we know how to map (text/thinking/tool_use
 * deltas, finish_reason) and returns `null` for the rest so the
 * caller can discard them.
 *
 * Public API:
 *   convertAnthropicChunkToOpenAI(parsed, brainEntry, upstreamMessageId?)
 *
 * Internal layout: each Anthropic variant has its own handler (one
 * per discriminated-union case) so future Anthropic schema changes
 * force a TypeScript compile error in the dispatch site rather than
 * silently producing a malformed OpenAI chunk.
 */

import type { BrainModelEntry } from "./brainRegistry";
import {
  isAnthropicStreamConvertibleEvent,
  type AnthropicStreamConvertibleEvent,
  type AnthropicContentBlockDelta,
  type AnthropicContentBlockStartToolUse,
  type AnthropicMessageDelta,
} from "../types/anthropicStream";

/** OpenAI chunk shape (loose typing — the OpenAI SDK types in src/types/openai are stricter). */
export type OpenAIChatCompletionChunk = Record<string, unknown>;

interface ChunkBase {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
}

export function convertAnthropicChunkToOpenAI(
  parsed: unknown,
  brainEntry: BrainModelEntry,
  upstreamMessageId?: string,
): OpenAIChatCompletionChunk | null {
  if (!isAnthropicStreamConvertibleEvent(parsed)) return null;
  const base = makeChunkBase(brainEntry, upstreamMessageId);
  return dispatchAnthropicEvent(parsed, base);
}

function makeChunkBase(
  brainEntry: BrainModelEntry,
  upstreamMessageId?: string,
): ChunkBase {
  const created = Math.floor(Date.now() / 1000);
  if (
    typeof upstreamMessageId === "string" &&
    upstreamMessageId.length > 0
  ) {
    return {
      id: upstreamMessageId,
      object: "chat.completion.chunk",
      created,
      model: brainEntry.upstream,
    };
  }
  // Defensive fallback: 10 base36 chars (~3.6e15 combinations) keeps
  // collision risk negligible before message_start has been captured.
  return {
    id: `chatcmpl-${created}-${Math.random().toString(36).slice(2, 12)}`,
    object: "chat.completion.chunk",
    created,
    model: brainEntry.upstream,
  };
}

function dispatchAnthropicEvent(
  parsed: AnthropicStreamConvertibleEvent,
  base: ChunkBase,
): OpenAIChatCompletionChunk | null {
  switch (parsed.type) {
    case "content_block_start":
      return convertToolUseStart(parsed, base);
    case "content_block_delta":
      return convertContentBlockDelta(parsed, base);
    case "message_delta":
      return convertMessageDelta(parsed, base);
  }
}

function convertToolUseStart(
  parsed: AnthropicContentBlockStartToolUse,
  base: ChunkBase,
): OpenAIChatCompletionChunk {
  // Initial OpenAI tool_call chunk carrying id + type + function.name so
  // the client can register the call before the argument deltas arrive.
  // Without this, openai-format clients see argument fragments they cannot
  // associate with any tool call (tool use silently broken).
  return {
    ...base,
    choices: [
      {
        index: parsed.index,
        delta: {
          tool_calls: [
            {
              index: parsed.index,
              id: parsed.content_block.id,
              type: "function",
              function: {
                name: parsed.content_block.name,
                arguments: "",
              },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  };
}

function convertContentBlockDelta(
  parsed: AnthropicContentBlockDelta,
  base: ChunkBase,
): OpenAIChatCompletionChunk {
  if (parsed.delta.type === "text_delta") {
    return {
      ...base,
      choices: [
        {
          index: parsed.index,
          delta: { content: parsed.delta.text },
          finish_reason: null,
        },
      ],
    };
  }
  if (parsed.delta.type === "thinking_delta") {
    return {
      ...base,
      choices: [
        {
          index: parsed.index,
          delta: { reasoning_content: parsed.delta.thinking },
          finish_reason: null,
        },
      ],
    };
  }
  // input_json_delta — tool input streaming. `tool_calls[].index` mirrors
  // `parsed.index` so the client correlates deltas with the matching
  // content_block_start chunk emitted earlier.
  return {
    ...base,
    choices: [
      {
        index: parsed.index,
        delta: {
          tool_calls: [
            {
              index: parsed.index,
              function: { arguments: parsed.delta.partial_json },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  };
}

function convertMessageDelta(
  parsed: AnthropicMessageDelta,
  base: ChunkBase,
): OpenAIChatCompletionChunk | null {
  const stopReason = parsed.delta.stop_reason;
  if (!stopReason) return null;
  const finishReason: string =
    stopReason === "end_turn"
      ? "stop"
      : stopReason === "max_tokens"
        ? "length"
        : stopReason === "tool_use"
          ? "tool_calls"
          : stopReason;
  return {
    ...base,
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
  };
}