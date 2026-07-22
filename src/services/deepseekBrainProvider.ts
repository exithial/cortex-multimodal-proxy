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

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const DEEPSEEK_TIMEOUT_MS = parseInt(
  process.env.DEEPSEEK_TIMEOUT_MS || "120000",
);

export class DeepSeekBrainProvider implements BrainProvider {
  readonly name = "deepseek-direct";
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.apiKey = DEEPSEEK_API_KEY;
    this.baseUrl = DEEPSEEK_BASE_URL;
    this.timeout = DEEPSEEK_TIMEOUT_MS;
    if (!this.apiKey) {
      throw new Error("DEEPSEEK_API_KEY no configurado en .env");
    }
  }

  resolveEndpointUrl(_endpoint: "openai" | "anthropic"): string {
    return `${this.baseUrl}/chat/completions`;
  }

  buildAuthHeaders(_endpoint: "openai" | "anthropic"): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  buildPayload(
    request: ChatCompletionRequest,
    upstreamModel: string,
    thinking: boolean,
    maxContextTokens: number,
    _endpoint: "openai" | "anthropic",
  ): any {
    const validMessages = prepareMessages(request.messages, thinking);
    const truncatedMessages = truncateMessages(validMessages, maxContextTokens);

    const payload: any = {
      model: upstreamModel,
      messages: truncatedMessages,
      stream: request.stream || false,
    };

    if (request.temperature !== undefined) payload.temperature = request.temperature;
    if (request.max_tokens !== undefined) payload.max_tokens = request.max_tokens;
    if (request.tools) payload.tools = request.tools;
    if (request.tool_choice !== undefined) payload.tool_choice = request.tool_choice;
    if (request.response_format !== undefined) payload.response_format = request.response_format;
    if (thinking) payload.thinking = { type: "enabled" };

    return payload;
  }

  async createChatCompletion(
    request: ChatCompletionRequest,
    brainEntry: BrainModelEntry,
  ): Promise<ChatCompletionResponse> {
    const endpoint = brainEntry.endpoint;
    const payload = this.buildPayload(
      request,
      brainEntry.upstream,
      brainEntry.thinking,
      brainEntry.context,
      endpoint,
    );
    const url = this.resolveEndpointUrl(endpoint);

    logger.info(
      `DeepSeek: POST ${url} | model: ${brainEntry.upstream} | thinking: ${brainEntry.thinking}`,
    );

    const maxRetries = 3;
    const baseDelay = 2000;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(url, payload, {
          headers: this.buildAuthHeaders(endpoint),
          timeout: this.timeout,
        });
        return response.data;
      } catch (error: unknown) {
        lastError = error;
        const status =
          (error as any)?.isAxiosError && (error as any).response?.status !== undefined
            ? (error as any).response.status
            : 0;
        const isRetryable = status === 503 || status === 502 || status === 429;

        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        const retryAfter =
          (error as any)?.isAxiosError && (error as any).response?.headers?.["retry-after"]
            ? parseInt((error as any).response.headers["retry-after"]) * 1000
            : 0;
        const delay = retryAfter || baseDelay * Math.pow(2, attempt - 1);
        logger.warn(
          `DeepSeek: ${status} en ${brainEntry.upstream}, reintento ${attempt}/${maxRetries} en ${delay}ms`,
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
    const endpoint = brainEntry.endpoint;
    const payload = this.buildPayload(
      request,
      brainEntry.upstream,
      brainEntry.thinking,
      brainEntry.context,
      endpoint,
    );
    payload.stream = true;
    const url = this.resolveEndpointUrl(endpoint);

    logger.info(
      `DeepSeek (stream): POST ${url} | model: ${brainEntry.upstream}`,
    );

    let buffer = "";
    let ended = false;

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
          headers: this.buildAuthHeaders(endpoint),
          timeout: this.timeout,
          responseType: "stream",
          signal,
        });
        break;
      } catch (error: unknown) {
        if (signal?.aborted) return;
        const status =
          (error as any)?.isAxiosError && (error as any).response?.status !== undefined
            ? (error as any).response.status
            : 0;
        const isRetryable = status === 503 || status === 502 || status === 429;

        if (!isRetryable || attempt === maxRetries) {
          onError(error);
          safeEnd();
          return;
        }

        const retryAfter =
          (error as any)?.isAxiosError && (error as any).response?.headers?.["retry-after"]
            ? parseInt((error as any).response.headers["retry-after"]) * 1000
            : 0;
        const delay = retryAfter || baseDelay * Math.pow(2, attempt - 1);
        logger.warn(
          `DeepSeek (stream): ${status} en ${brainEntry.upstream}, reintento ${attempt}/${maxRetries} en ${delay}ms`,
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
          if (line.startsWith("data: ")) {
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") {
              safeEnd();
              return;
            }
            onChunk(`data: ${payload}\n\n`);
          } else {
            onChunk(`${line}\n`);
          }
        }
      });

      stream.on("end", () => {
        if (ended) return;
        if (buffer.trim()) onChunk(`${buffer}\n`);
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

export const deepseekBrainProvider = process.env.DEEPSEEK_API_KEY
  ? new DeepSeekBrainProvider()
  : null;