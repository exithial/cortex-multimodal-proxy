import axios from "axios";
import { logger } from "../utils/logger";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from "../types/openai";
import type {
  BrainModelEntry,
  BrainProvider,
} from "./brainProvider";
import type {
  VisionContentType,
  VisionProvider,
} from "./visionProvider";
import { randomUUID } from "crypto";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "";
const MINIMAX_BASE_URL =
  process.env.MINIMAX_BASE_URL || "https://api.minimax.io/anthropic";
const MINIMAX_CHAT_MODEL =
  process.env.MINIMAX_CHAT_MODEL || "MiniMax-M3";
const MINIMAX_TIMEOUT_MS = parseInt(
  process.env.MINIMAX_TIMEOUT_MS || process.env.SENSES_TIMEOUT_MS || "120000",
);

const IMAGE_PROMPT =
  process.env.SENSES_IMAGE_PROMPT ||
  `Describe esta imagen con precisión técnica para que un programador ciego pueda recrearla.
INSTRUCCIONES ESPECÍFICAS:
1. Si es una INTERFAZ DE USUARIO: Describe layout, elementos, botones, colores, texto visible, jerarquía visual.
2. Si es un DIAGRAMA DE ARQUITECTURA: Describe componentes, conexiones, flujo de datos, relaciones.
3. Si es una CAPTURA DE ERROR: Describe mensajes de error, stack traces, contexto visual.
4. Si contiene TEXTO: Transcribe TODO el texto visible preservando estructura.
5. Sé LITERAL y PRECISO: No interpretes, solo describe.`;

class MiniMaxM3Provider implements BrainProvider, VisionProvider {
  readonly name = "minimax-m3";
  private readonly supportedVisionTypes = new Set<VisionContentType>([
    "image",
    "video",
  ]);

  constructor() {
    if (!MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY no configurado en .env");
    }
  }

  isAvailable(): boolean {
    return !!MINIMAX_API_KEY;
  }

  supportsContentType(type: VisionContentType): boolean {
    return this.supportedVisionTypes.has(type);
  }

  async describeImage(
    imageUrl: string,
    userContext: string = "",
  ): Promise<string> {
    return this.describeContent("image", imageUrl, userContext);
  }

  async describeVideo(
    videoUrl: string,
    userContext: string = "",
  ): Promise<string> {
    return this.describeContent("video", videoUrl, userContext);
  }

  private async describeContent(
    contentType: "image" | "video",
    contentUrl: string,
    userContext: string,
  ): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error("MINIMAX_API_KEY no configurado en .env");
    }

    const prompt = userContext
      ? `${IMAGE_PROMPT}\n\nContexto del usuario: ${userContext}`
      : IMAGE_PROMPT;

    const payload = {
      model: MINIMAX_CHAT_MODEL,
      messages: [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: prompt },
            {
              type: contentType,
              source: { type: "url" as const, url: contentUrl },
            },
          ],
        },
      ],
      max_tokens: 4096,
      stream: false,
      thinking: { type: "disabled" as const },
    };

    logger.info(
      `MiniMax M3: Describiendo ${contentType} con ${MINIMAX_CHAT_MODEL}...`,
    );

    const response = await this.postWithRetry(
      `${MINIMAX_BASE_URL}/v1/messages`,
      payload,
    );

    const text = (response.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    if (!text) {
      throw new Error("MiniMax M3: respuesta vacía");
    }
    if (response.usage) {
      logger.info(
        `MiniMax M3: in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
      );
    }
    return text;
  }

  // ============================================================================
  // BrainProvider — chat directo (passthrough)
  // ============================================================================

  resolveEndpointUrl(_endpoint: "openai" | "anthropic"): string {
    return `${MINIMAX_BASE_URL}/v1/messages`;
  }

  buildAuthHeaders(_endpoint: "openai" | "anthropic"): Record<string, string> {
    return {
      "x-api-key": MINIMAX_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    };
  }

  buildPayload(
    request: ChatCompletionRequest,
    _upstreamModel: string,
    thinking: boolean,
    _maxContextTokens: number,
    _endpoint: "openai" | "anthropic",
  ): any {
    // Convertir OpenAI-format -> Anthropic-format
    const systemMsg = request.messages.find((m) => m.role === "system");
    const nonSystem = request.messages.filter((m) => m.role !== "system");

    const anthropicMessages = nonSystem.map((m: any) => {
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
        if (m.content) blocks.push({ type: "text", text: m.content });
        for (const tc of m.tool_calls) {
          let input: any = {};
          try {
            input = tc.function.arguments
              ? JSON.parse(tc.function.arguments)
              : {};
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
      // OpenAI user content can be string OR array of parts (text/image_url/etc)
      if (typeof m.content === "string" || m.content === undefined) {
        return { role: m.role === "assistant" ? "assistant" : "user", content: m.content ?? "" };
      }
      // Array content — translate image_url -> Anthropic image block
      const blocks: any[] = [];
      for (const part of m.content) {
        if (part.type === "text") {
          blocks.push({ type: "text", text: part.text });
        } else if (part.type === "image_url" && part.image_url?.url) {
          blocks.push({
            type: "image",
            source: { type: "url", url: part.image_url.url },
          });
        }
        // Otros tipos (audio/video) no soportados por MiniMax-M3
      }
      return { role: "user", content: blocks };
    });

    const payload: any = {
      model: MINIMAX_CHAT_MODEL,
      messages: anthropicMessages,
      max_tokens: request.max_tokens || 4096,
      stream: request.stream || false,
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
      // "adaptive" is currently the only supported upstream thinking control.
      // Adding a new mode (e.g. "enabled" with budget_tokens) requires updating
      // both this branch and the log line that surfaces `payload.thinking?.type`.
      payload.thinking = { type: "adaptive" as const };
    }
    return payload;
  }

  async createChatCompletion(
    request: ChatCompletionRequest,
    brainEntry: BrainModelEntry,
  ): Promise<ChatCompletionResponse> {
    const payload = this.buildPayload(
      request,
      MINIMAX_CHAT_MODEL,
      brainEntry.thinking,
      1_048_576,
      "anthropic",
    );
    const url = this.resolveEndpointUrl("anthropic");
    logger.info(
      `MiniMax M3: POST ${url} | model: ${MINIMAX_CHAT_MODEL} | thinking: ${payload.thinking?.type ?? "none"}`,
    );

    const anthropicResponse = await this.postWithRetry(url, payload);
    return this.anthropicToOpenAIResponse(anthropicResponse, request);
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
      MINIMAX_CHAT_MODEL,
      brainEntry.thinking,
      1_048_576,
      "anthropic",
    );
    payload.stream = true;
    const url = this.resolveEndpointUrl("anthropic");
    logger.info(
      `MiniMax M3 (stream): POST ${url} | model: ${MINIMAX_CHAT_MODEL} | thinking: ${payload.thinking?.type ?? "none"}`,
    );

    let buffer = "";
    let ended = false;
    const safeEnd = () => {
      if (ended) return;
      ended = true;
      onComplete();
    };

    // Single response id reused across ALL chunks in this stream. The
    // OpenAI convention is one id per response (not per chunk), and
    // clients like OpenCode use it to associate chunks with the same
    // response — a per-chunk id would cause context counters to reset.
    const chunkId = `chatcmpl-${randomUUID()}`;
    const createdAt = Math.floor(Date.now() / 1000);

    const maxRetries = 3;
    const baseDelay = 2000;
    let response: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await axios.post(url, payload, {
          headers: this.buildAuthHeaders("anthropic"),
          timeout: MINIMAX_TIMEOUT_MS,
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
          `MiniMax M3 (stream): ${status}, reintento ${attempt}/${maxRetries} en ${delay}ms`,
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
            const payloadStr = line.slice(6).trim();
            if (payloadStr === "[DONE]") {
              safeEnd();
              return;
            }
            try {
              const parsed = JSON.parse(payloadStr);
              const openaiChunk = this.anthropicStreamToOpenAIChunk(
                parsed,
                request,
                chunkId,
                createdAt,
              );
              if (openaiChunk) {
                onChunk(`data: ${JSON.stringify(openaiChunk)}\n\n`);
              }
            } catch {
              continue;
            }
          }
        }
      });

      stream.on("end", () => {
        if (ended) return;
        if (buffer.trim()) onChunk(`${buffer}\n`);
        onChunk("data: [DONE]\n\n");
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

  // ============================================================================
  // Helpers Anthropic -> OpenAI
  // ============================================================================

  private async postWithRetry(url: string, payload: any): Promise<any> {
    let lastError: unknown;
    const maxRetries = 3;
    const baseDelay = 2000;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(url, payload, {
          headers: this.buildAuthHeaders("anthropic"),
          timeout: MINIMAX_TIMEOUT_MS,
        });
        return response.data;
      } catch (error: unknown) {
        lastError = error;
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : 0;
        const isRetryable = status === 503 || status === 502 || status === 429;
        if (!isRetryable || attempt === maxRetries) throw error;
        const retryAfter = axios.isAxiosError(error)
          ? parseInt(error.response?.headers?.["retry-after"] || "0") * 1000
          : 0;
        const delay = retryAfter || baseDelay * Math.pow(2, attempt - 1);
        logger.warn(
          `MiniMax M3: ${status}, reintento ${attempt}/${maxRetries} en ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }

  private anthropicToOpenAIResponse(
    anthropic: any,
    request: ChatCompletionRequest,
  ): ChatCompletionResponse {
    const blocks = anthropic.content || [];
    let text = "";
    let reasoning = "";
    let toolCalls: any[] | undefined;
    for (const b of blocks) {
      if (b.type === "text") text += (text ? "\n" : "") + b.text;
      else if (b.type === "thinking") {
        reasoning += (reasoning ? "\n" : "") + (b.thinking || "");
      }
      // redacted_thinking: Anthropic safety-redacted reasoning (encrypted
      // blob in `b.data`). OpenAI clients can't decrypt it, so we drop it
      // explicitly rather than relying on fall-through. Mirrors the
      // qwen3.7-max opencodeGo path.
      else if (b.type === "redacted_thinking") {
        // Intentionally skipped — see comment above.
      } else if (b.type === "tool_use") {
        toolCalls = toolCalls ?? [];
        toolCalls.push({
          id: b.id,
          type: "function",
          function: {
            name: b.name,
            arguments: JSON.stringify(b.input ?? {}),
          },
        });
      }
    }
    const message: any = { role: "assistant", content: text };
    if (reasoning) message.reasoning_content = reasoning;
    if (toolCalls?.length) message.tool_calls = toolCalls;
    const stopReason = anthropic.stop_reason;
    const finishReason =
      stopReason === "end_turn"
        ? "stop"
        : stopReason === "max_tokens"
          ? "length"
          : stopReason === "tool_use"
            ? "tool_calls"
            : "stop";
    return {
      id: `chatcmpl-${randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          message,
          finish_reason: finishReason,
          logprobs: null,
        },
      ],
      usage: anthropic.usage
        ? {
            prompt_tokens: anthropic.usage.input_tokens ?? 0,
            completion_tokens: anthropic.usage.output_tokens ?? 0,
            total_tokens:
              (anthropic.usage.input_tokens ?? 0) +
              (anthropic.usage.output_tokens ?? 0),
          }
        : undefined,
    };
  }

  private anthropicStreamToOpenAIChunk(
    parsed: any,
    request: ChatCompletionRequest,
    chunkId: string,
    createdAt: number,
  ): Record<string, unknown> | null {
    const base = {
      id: chunkId,
      object: "chat.completion.chunk",
      created: createdAt,
      model: request.model,
    };
    if (parsed.type === "content_block_start") {
      const block = parsed.content_block;
      if (block?.type === "tool_use") {
        return {
          ...base,
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: block.id,
                    type: "function",
                    function: {
                      name: block.name,
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
      return {
        ...base,
        choices: [
          {
            index: 0,
            delta: block?.type === "text" ? { role: "assistant", content: "" } : { role: "assistant" },
            finish_reason: null,
          },
        ],
      };
    }
    if (parsed.type === "content_block_delta") {
      const delta = parsed.delta;
      if (delta?.type === "text_delta") {
        return {
          ...base,
          choices: [
            {
              index: 0,
              delta: { content: delta.text },
              finish_reason: null,
            },
          ],
        };
      }
      if (delta?.type === "thinking_delta") {
        if (!delta.thinking || !delta.thinking.trim()) {
          return null;
        }
        return {
          ...base,
          choices: [
            {
              index: 0,
              delta: { reasoning_content: delta.thinking },
              finish_reason: null,
            },
          ],
        };
      }
      // signature_delta: Anthropic thinking signature (required for
      // cryptographic re-validation by the upstream). We forward reasoning
      // as raw text to OpenAI clients which can't re-validate, so we
      // intentionally drop this. Mirrors the qwen3.7-max opencodeGo path.
      if (delta?.type === "signature_delta") {
        return null;
      }
      if (delta?.type === "input_json_delta") {
        return {
          ...base,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: 0, function: { arguments: delta.partial_json || "" } },
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
              : "stop";
      const chunk: Record<string, unknown> = {
        ...base,
        choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
      };
      const u = parsed.usage;
      if (u && typeof u === "object") {
        const inTok = typeof u.input_tokens === "number" ? u.input_tokens : 0;
        const outTok =
          typeof u.output_tokens === "number" ? u.output_tokens : 0;
        chunk.usage = {
          prompt_tokens: inTok,
          completion_tokens: outTok,
          total_tokens: inTok + outTok,
        };
      }
      return chunk;
    }
    return null;
  }
}

export const minimaxM3Provider = MINIMAX_API_KEY
  ? new MiniMaxM3Provider()
  : null;

// Backward-compatible alias (kept for callers still importing the old name).
export { MiniMaxM3Provider as MiniMaxM3VisionProvider };
export const minimaxM3VisionProvider = minimaxM3Provider;
