import axios from "axios";
import { logger } from "../utils/logger";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "../types/openai";
import type { BrainModelEntry, BrainProvider } from "./brainProvider";
import {
  prepareMessages,
  truncateMessages,
} from "./messageTransforms";
import { openAIToAnthropicPayload } from "./anthropicPayloadConverter";
import { convertAnthropicChunkToOpenAI } from "./anthropicStreamConverter";

const OPENCODE_GO_API_KEY = process.env.OPENCODE_GO_API_KEY || "";
const OPENCODE_GO_BASE_URL =
  process.env.OPENCODE_GO_BASE_URL || "https://opencode.ai/zen/go/v1";
const OPENCODE_GO_TIMEOUT_MS = parseInt(
  process.env.OPENCODE_GO_TIMEOUT_MS || "120000",
);

export class OpenCodeGoBrainProvider implements BrainProvider {
  readonly name = "opencode-go";
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.apiKey = OPENCODE_GO_API_KEY;
    this.baseUrl = OPENCODE_GO_BASE_URL;
    this.timeout = OPENCODE_GO_TIMEOUT_MS;
    if (!this.apiKey) {
      throw new Error("OPENCODE_GO_API_KEY no configurado en .env");
    }
  }

  resolveEndpointUrl(endpoint: "openai" | "anthropic"): string {
    if (endpoint === "anthropic") {
      return `${this.baseUrl}/messages`;
    }
    return `${this.baseUrl}/chat/completions`;
  }

  buildAuthHeaders(endpoint: "openai" | "anthropic"): Record<string, string> {
    if (endpoint === "anthropic") {
      return {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      };
    }
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  convertAnthropicChunkToOpenAI(
    parsed: unknown,
    brainEntry: BrainModelEntry,
    upstreamMessageId?: string,
  ): Record<string, unknown> | null {
    return convertAnthropicChunkToOpenAI(parsed, brainEntry, upstreamMessageId);
  }

  buildPayload(
    request: ChatCompletionRequest,
    upstreamModel: string,
    thinking: boolean,
    maxContextTokens: number,
    endpoint: "openai" | "anthropic",
  ): any {
    const validMessages = prepareMessages(request.messages, thinking);
    const truncatedMessages = truncateMessages(validMessages, maxContextTokens);

    if (endpoint === "anthropic") {
      return openAIToAnthropicPayload(
        request,
        upstreamModel,
        truncatedMessages,
        request.stream || false,
        thinking,
      );
    }

    const payload: any = {
      model: upstreamModel,
      messages: truncatedMessages,
      stream: request.stream || false,
    };

    if (request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }
    if (request.max_tokens !== undefined) {
      payload.max_tokens = request.max_tokens;
    }
    if (request.tools) {
      payload.tools = request.tools;
    }
    if (request.tool_choice !== undefined) {
      payload.tool_choice = request.tool_choice;
    }
    if (request.response_format !== undefined) {
      payload.response_format = request.response_format;
    }
    if (thinking) {
      payload.thinking = { type: "enabled" };
    }

    return payload;
  }

  async createChatCompletion(
    request: ChatCompletionRequest,
    brainEntry: BrainModelEntry,
  ): Promise<ChatCompletionResponse> {
    const payload = this.buildPayload(
      request,
      brainEntry.upstream,
      brainEntry.thinking,
      brainEntry.context,
      brainEntry.endpoint,
    );
    const url = this.resolveEndpointUrl(brainEntry.endpoint);

    logger.info(
      `OpenCode Go: POST ${url} | model: ${brainEntry.upstream} | thinking: ${brainEntry.thinking}`,
    );

    const maxRetries = 3;
    const baseDelay = 2000;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(url, payload, {
          headers: this.buildAuthHeaders(brainEntry.endpoint),
          timeout: this.timeout,
        });
        return response.data;
      } catch (error: unknown) {
        lastError = error;
        const status = axios.isAxiosError(error) ? error.response?.status : 0;
        const isRetryable = status === 503 || status === 502 || status === 429;

        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        const retryAfter = axios.isAxiosError(error)
          ? parseInt(error.response?.headers?.["retry-after"] || "0") * 1000
          : 0;
        const delay = retryAfter || baseDelay * Math.pow(2, attempt - 1);
        logger.warn(
          `OpenCode Go: ${status} en ${brainEntry.upstream}, reintento ${attempt}/${maxRetries} en ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastError;
  }

  async chatCompletionStream(
    request: ChatCompletionRequest,
    brainEntry: BrainModelEntry,
    onChunk: (chunk: string) => void,
    onError: (error: unknown) => void,
    onComplete: () => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const payload = this.buildPayload(
      request,
      brainEntry.upstream,
      brainEntry.thinking,
      brainEntry.context,
      brainEntry.endpoint,
    );
    payload.stream = true;
    const url = this.resolveEndpointUrl(brainEntry.endpoint);

    logger.info(
      `OpenCode Go (stream): POST ${url} | model: ${brainEntry.upstream}`,
    );

    let buffer = "";
    let ended = false;
    let upstreamMessageId: string | undefined;

    const safeEnd = () => {
      if (ended) return;
      ended = true;
      onComplete();
    };

    const maxRetries = 3;
    const baseDelay = 2000;
    let response: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await axios.post(url, payload, {
          headers: this.buildAuthHeaders(brainEntry.endpoint),
          timeout: this.timeout,
          responseType: "stream",
          signal,
        });
        break;
      } catch (error: unknown) {
        if (signal?.aborted) return;
        const status = axios.isAxiosError(error) ? error.response?.status : 0;
        const isRetryable = status === 503 || status === 502 || status === 429;

        if (!isRetryable || attempt === maxRetries) {
          onError(error);
          safeEnd();
          return;
        }

        const retryAfter = axios.isAxiosError(error)
          ? parseInt(error.response?.headers?.["retry-after"] || "0") * 1000
          : 0;
        const delay = retryAfter || baseDelay * Math.pow(2, attempt - 1);
        logger.warn(
          `OpenCode Go (stream): ${status} en ${brainEntry.upstream}, reintento ${attempt}/${maxRetries} en ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    try {
      const stream = response.data;

      stream.on("data", (chunk: Buffer) => {
        if (ended) return;
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("event: ")) continue;
          if (line.startsWith("data: ")) {
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") {
              safeEnd();
              return;
            }
            try {
              const parsed = JSON.parse(payload);
              if (
                brainEntry.endpoint === "anthropic" &&
                parsed.type === "message_start" &&
                parsed.message?.id &&
                typeof parsed.message.id === "string"
              ) {
                upstreamMessageId = parsed.message.id;
              }
              let chunkToSend: string;
              if (brainEntry.endpoint === "anthropic") {
                const openaiChunk = this.convertAnthropicChunkToOpenAI(
                  parsed,
                  brainEntry,
                  upstreamMessageId,
                );
                if (!openaiChunk) continue;
                chunkToSend = JSON.stringify(openaiChunk);
              } else {
                chunkToSend = payload;
              }
              onChunk(`data: ${chunkToSend}\n\n`);
            } catch {
              continue;
            }
          } else {
            onChunk(`${line}\n`);
          }
        }
      });

      stream.on("end", () => {
        if (ended) return;
        if (buffer.trim()) {
          onChunk(`${buffer}\n`);
        }
        safeEnd();
      });

      stream.on("error", (error: unknown) => {
        if (ended) return;
        ended = true;
        if (signal?.aborted) return;
        onError(error);
      });
    } catch (error: unknown) {
      onError(error);
      safeEnd();
    }
  }
}

export const opencodeGoBrainProvider = process.env.OPENCODE_GO_API_KEY
  ? new OpenCodeGoBrainProvider()
  : null;