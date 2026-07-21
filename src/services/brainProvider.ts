import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "../types/openai";

export interface BrainModelEntry {
  upstream: string;
  context: number;
  maxOutput: number;
  thinking: boolean;
  inputPrice: number;
  outputPrice: number;
  endpoint: "openai" | "anthropic";
  multimodal: boolean;
}

export interface BrainProvider {
  readonly name: string;
  buildPayload(
    request: ChatCompletionRequest,
    upstreamModel: string,
    thinking: boolean,
    maxContextTokens: number,
    endpoint: "openai" | "anthropic",
  ): any;
  resolveEndpointUrl(endpoint: "openai" | "anthropic"): string;
  buildAuthHeaders(endpoint: "openai" | "anthropic"): Record<string, string>;
  createChatCompletion(
    request: ChatCompletionRequest,
    brainEntry: BrainModelEntry,
  ): Promise<ChatCompletionResponse>;
  chatCompletionStream(
    request: ChatCompletionRequest,
    brainEntry: BrainModelEntry,
    onChunk: (chunk: string) => void,
    onError: (error: unknown) => void,
    onComplete: () => void,
    signal?: AbortSignal,
  ): Promise<void>;
  convertAnthropicChunkToOpenAI?(
    parsed: unknown,
    brainEntry: BrainModelEntry,
    upstreamMessageId?: string,
  ): Record<string, unknown> | null;
}
