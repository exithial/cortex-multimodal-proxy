/**
 * Strictly-typed discriminated union for the subset of Anthropic SSE events
 * that `OpenCodeGoService.convertAnthropicChunkToOpenAI` actually handles.
 *
 * Mirrors the field shape of `AnthropicStreamEvent` in `./anthropic.ts` but
 * narrows `type` to a literal per variant so TypeScript can exhaustively
 * type-check dispatch in the consumer (instead of `any` plus runtime
 * `if (parsed.type === ...)` ladders that drift out of sync when the upstream
 * schema evolves).
 *
 * `index` is the Anthropic content_block index (0-based, increments per
 * block). `tool_calls[].index` in the OpenAI output mirrors it so openai
 * clients correlate accumulating arguments with the correct tool call.
 *
 * Only events that map to an OpenAI `ChatCompletionChunk` are included.
 * Events without an OpenAI equivalent (`message_start`, `content_block_stop`,
 * `message_stop`, `ping`, `error`, and the `text` flavour of
 * `content_block_start`) are intentionally absent — the consumer returns
 * `null` for them and the caller discards the chunk.
 */

// --- content_block_delta variants ---

export interface AnthropicContentBlockDeltaText {
  type: "content_block_delta";
  index: number;
  delta: { type: "text_delta"; text: string };
}

export interface AnthropicContentBlockDeltaThinking {
  type: "content_block_delta";
  index: number;
  delta: { type: "thinking_delta"; thinking: string };
}

export interface AnthropicContentBlockDeltaInputJson {
  type: "content_block_delta";
  index: number;
  delta: { type: "input_json_delta"; partial_json: string };
}

export type AnthropicContentBlockDelta =
  | AnthropicContentBlockDeltaText
  | AnthropicContentBlockDeltaThinking
  | AnthropicContentBlockDeltaInputJson;

// --- content_block_start variants we actually convert (tool_use only) ---

export interface AnthropicContentBlockStartToolUse {
  type: "content_block_start";
  index: number;
  content_block: {
    type: "tool_use";
    id: string;
    name: string;
    // `input` is present in the upstream payload but the OpenAI client
    // receives arguments incrementally via subsequent input_json_delta
    // events, so we don't read it here.
    input?: Record<string, unknown>;
  };
}

// --- message_delta (carries stop_reason -> finish_reason) ---

export type AnthropicStopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "tool_use";

export interface AnthropicMessageDelta {
  type: "message_delta";
  delta: {
    stop_reason: AnthropicStopReason | null;
    stop_sequence?: string | null;
  };
  usage?: { output_tokens: number };
}

// --- discriminated union consumed by convertAnthropicChunkToOpenAI ---

export type AnthropicStreamConvertibleEvent =
  | AnthropicContentBlockStartToolUse
  | AnthropicContentBlockDelta
  | AnthropicMessageDelta;

/**
 * Type guard: narrows an unknown SSE payload to the subset of Anthropic
 * events we know how to convert. Returns `false` for `message_start`,
 * `content_block_start` with `content_block.type !== "tool_use"`,
 * `content_block_stop`, `message_stop`, `ping`, `error`, and any malformed
 * payload — the caller treats those as no-op chunks to discard.
 */
export function isAnthropicStreamConvertibleEvent(
  parsed: unknown,
): parsed is AnthropicStreamConvertibleEvent {
  if (!parsed || typeof parsed !== "object") return false;
  const event = parsed as Record<string, unknown>;

  if (event.type === "content_block_start") {
    const cb = event.content_block as
      | { type?: string; id?: unknown; name?: unknown }
      | undefined;
    return (
      cb?.type === "tool_use" &&
      typeof cb.id === "string" &&
      typeof cb.name === "string"
    );
  }

  if (event.type === "content_block_delta") {
    const delta = event.delta as
      | { type?: string; text?: unknown; thinking?: unknown; partial_json?: unknown }
      | undefined;
    if (typeof event.index !== "number" || !delta) return false;
    if (delta.type === "text_delta") return typeof delta.text === "string";
    if (delta.type === "thinking_delta")
      return typeof delta.thinking === "string";
    if (delta.type === "input_json_delta")
      return typeof delta.partial_json === "string";
    return false;
  }

  if (event.type === "message_delta") {
    const delta = event.delta as { stop_reason?: unknown } | undefined;
    return (
      !!delta &&
      (delta.stop_reason === null ||
        delta.stop_reason === "end_turn" ||
        delta.stop_reason === "max_tokens" ||
        delta.stop_reason === "stop_sequence" ||
        delta.stop_reason === "tool_use")
    );
  }

  return false;
}