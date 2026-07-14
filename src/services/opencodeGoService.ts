import axios from "axios";
import { logger } from "../utils/logger";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from "../types/openai";
import type { BrainModelEntry } from "./brainRegistry";
import {
  prepareMessages,
  truncateMessages,
} from "./messageTransforms";

const OPENCODE_GO_API_KEY = process.env.OPENCODE_GO_API_KEY || "";
const OPENCODE_GO_BASE_URL =
  process.env.OPENCODE_GO_BASE_URL || "https://opencode.ai/zen/go/v1";
const OPENCODE_GO_TIMEOUT_MS = parseInt(
  process.env.OPENCODE_GO_TIMEOUT_MS || "120000",
);

if (!OPENCODE_GO_API_KEY) {
  throw new Error("OPENCODE_GO_API_KEY no configurado en .env");
}

function openAIToAnthropicPayload(
  request: ChatCompletionRequest,
  upstreamModel: string,
  validMessages: any[],
  stream: boolean,
  thinking: boolean,
): any {
  const systemMsg = validMessages.find((m) => m.role === "system");
  const nonSystemMessages = validMessages.filter((m) => m.role !== "system");

  const anthropicMessages = nonSystemMessages.map((m: any) => {
    if (m.role === "tool") {
      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.tool_call_id,
            content:
              typeof m.content === "string"
                ? m.content
                : JSON.stringify(m.content),
          },
        ],
      };
    }
    if (m.role === "assistant" && m.tool_calls?.length) {
      const blocks: any[] = [];
      if (m.content) {
        blocks.push({ type: "text", text: m.content });
      }
      for (const tc of m.tool_calls) {
        let input: any = {};
        try {
          input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          input = { _raw: tc.function.arguments };
        }
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input,
        });
      }
      return { role: "assistant", content: blocks };
    }
    return {
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    };
  });

  const payload: any = {
    model: upstreamModel,
    messages: anthropicMessages,
    max_tokens: request.max_tokens || 4096,
    stream,
  };

  if (systemMsg) {
    payload.system =
      typeof systemMsg.content === "string"
        ? systemMsg.content
        : JSON.stringify(systemMsg.content);
  }
  if (request.temperature !== undefined) {
    payload.temperature = request.temperature;
  }
  if (request.tools) {
    payload.tools = request.tools.map((tool: any) => {
      if (tool.type === "function") {
        return {
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters,
        };
      }
      return tool;
    });
  }
  if (thinking) {
    const budgetTokens = Math.max(1024, Math.floor(payload.max_tokens / 4));
    payload.thinking = {
      type: "enabled",
      budget_tokens: budgetTokens,
    };
    if (!payload.max_tokens || payload.max_tokens < budgetTokens + 1024) {
      payload.max_tokens = budgetTokens + 4096;
    }
  }

  return payload;
}

class OpenCodeGoService {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.apiKey = OPENCODE_GO_API_KEY;
    this.baseUrl = OPENCODE_GO_BASE_URL;
    this.timeout = OPENCODE_GO_TIMEOUT_MS;
  }

  resolveEndpointUrl(endpoint: "openai" | "anthropic"): string {
    if (endpoint === "anthropic") {
      return `${this.baseUrl}/messages`;
    }
    return `${this.baseUrl}/chat/completions`;
  }

  private buildAuthHeaders(endpoint: "openai" | "anthropic"): Record<string, string> {
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

  /**
   * Convert an Anthropic SSE event to an OpenAI-format `ChatCompletionChunk`
   * for clients that speak the OpenAI streaming protocol (e.g. OpenCode TUI).
   *
   * Returns `null` for events that have no OpenAI equivalent and should be
   * filtered out (message_start, content_block_start, content_block_stop,
   * message_stop, ping, error). The caller is expected to discard `null`
   * rather than emit anything.
   *
   * `upstreamMessageId` is the id from the Anthropic message_start event; we
   * reuse it on every emitted chunk so the OpenAI client sees a stable id
   * in the upstream-issued format (`msg_xxx`) rather than a synthetic
   * `chatcmpl-<timestamp>` placeholder that some SDK validators reject.
   */
  convertAnthropicChunkToOpenAI(
    parsed: any,
    brainEntry: BrainModelEntry,
    upstreamMessageId?: string,
  ): any | null {
    if (!parsed || typeof parsed !== "object") return null;

    const created = Math.floor(Date.now() / 1000);
    const id =
      typeof upstreamMessageId === "string" && upstreamMessageId.length > 0
        ? upstreamMessageId
        : `chatcmpl-${created}-${Math.random().toString(36).slice(2, 8)}`;
    const base = {
      id,
      object: "chat.completion.chunk",
      created,
      model: brainEntry.upstream,
    };

    if (parsed.type === "content_block_delta") {
      const index = typeof parsed.index === "number" ? parsed.index : 0;
      const delta = parsed.delta;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        return {
          ...base,
          choices: [
            { index, delta: { content: delta.text }, finish_reason: null },
          ],
        };
      }
      if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
        return {
          ...base,
          choices: [
            {
              index,
              delta: { reasoning_content: delta.thinking },
              finish_reason: null,
            },
          ],
        };
      }
      if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
        // Tool input streaming — emit as a tool_calls delta chunk so openai-format
        // clients can reconstruct the tool call.
        return {
          ...base,
          choices: [
            {
              index,
              delta: {
                tool_calls: [
                  {
                    index,
                    function: { arguments: delta.partial_json },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        };
      }
    }

    if (parsed.type === "message_delta" && parsed.delta?.stop_reason) {
      const stopReason = parsed.delta.stop_reason;
      const finishReason =
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

    return null;
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
    // Captured from the upstream Anthropic message_start event so every
    // emitted OpenAI chunk can carry the same id (format `msg_xxx`).
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
        if (signal?.aborted) {
          return;
        }
        const status = axios.isAxiosError(error) ? error.response?.status : 0;
        const isRetryable = status === 503 || status === 502 || status === 429;

        if (!isRetryable || attempt === maxRetries) {
          safeEnd();
          onError(error);
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
        if (ended) {
          return;
        }
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("event: ")) {
            // Anthropic SSE event lines (e.g. "event: ping") — OpenAI SSE has no
            // event prefix; skip to avoid leaking Anthropic metadata to openai-format clients.
            continue;
          }
          if (line.startsWith("data: ")) {
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") {
              safeEnd();
              return;
            }
            try {
              const parsed = JSON.parse(payload);
              // Capture the upstream message id from Anthropic message_start
              // so every emitted chunk can carry a stable, upstream-issued id.
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
        if (ended) {
          return;
        }
        if (buffer.trim()) {
          onChunk(`${buffer}\n`);
        }
        safeEnd();
      });

      stream.on("error", (error: unknown) => {
        if (ended) {
          return;
        }
        ended = true;
        if (signal?.aborted) {
          return;
        }
        onError(error);
      });
    } catch (error: unknown) {
      safeEnd();
      onError(error);
    }
  }
}

export const opencodeGoService = new OpenCodeGoService();
