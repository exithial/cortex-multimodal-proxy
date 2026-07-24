import "dotenv/config";
import express, { Request, Response } from "express";
import { logger } from "./utils/logger";
import { cacheService } from "./services/cacheService";
import { processMultimodalContent } from "./middleware/multimodalProcessor";
import { anthropicAdapter } from "./services/anthropicAdapter";
import {
  getOpenCodeModelsList,
  getClaudeCodeModelsList,
} from "./utils/opencodeGoModels";
import {
  getBrainEntry,
  isPassthrough,
  PASSTHROUGH_MODELS,
} from "./services/brainRegistry";
import type { BrainModelEntry } from "./services/brainRegistry";
import {
  getActiveBrainProviderFor,
  getActiveBrainModels,
  getActiveProviderInfo,
  getActiveVisionProvider,
} from "./services/providerSelector";
import {
  dashboardService,
  type ClientKind,
  type RecordRequestPayload,
  type Strategy,
} from "./services/dashboardService";
import { mountDashboardRoutes } from "./routes/dashboard";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  ErrorResponse,
} from "./types/openai";
import type {
  AnthropicRequest,
  AnthropicError,
  AnthropicMessage,
} from "./types/anthropic";
import { getErrorMessage } from "./utils/error";
import packageJson from "../package.json";
import { randomUUID } from "crypto";

const app = express();
const PORT = parseInt(process.env.PORT || "7777");
const DEDUPE_TTL_MS = parseInt(process.env.DEDUPE_TTL_MS || "2000");
const HAIKU_DEFER_MS = parseInt(
  process.env.ANTHROPIC_HAIKU_DEFER_MS || "150",
);
const SERVER_START_TIME = Date.now();

const inFlightAnthropic = new Map<string, Promise<AnthropicMessage>>();
const inFlightAnthropicByContent = new Map<
  string,
  Promise<AnthropicMessage>
>();
const recentAnthropicResponses = new Map<
  string,
  { response: AnthropicMessage; expiresAt: number }
>();

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`,
  );
  return `{${entries.join(",")}}`;
}

function getClaudeModelMapping(model: string): {
internalModel: string;
  strategy: "passthrough" | "proxy-brain";
} {
  const haikuModel = process.env.CLAUDE_HAIKU_MODEL || "mimo-v2.5";
  const sonnetModel = process.env.CLAUDE_SONNET_MODEL || "proxy/deepseek-v4-pro";
  const opusModel = process.env.CLAUDE_OPUS_MODEL || "proxy/glm-5.2";

  let internalModel: string;
  switch (model) {
    case "haiku":
      internalModel = haikuModel;
      break;
    case "sonnet":
      internalModel = sonnetModel;
      break;
    case "opus":
      internalModel = opusModel;
      break;
    default:
      internalModel = model;
  }

  const strategy = isPassthrough(internalModel) ? "passthrough" : "proxy-brain";
  return { internalModel, strategy };
}

function getAnthropicRequestKey(request: AnthropicRequest): string {
  const { stream: _stream, ...rest } = request;
  return stableStringify(rest);
}

function getAnthropicContentKey(request: AnthropicRequest): string {
  const { stream: _stream, model: _model, ...rest } = request;
  return stableStringify(rest);
}

function getCachedAnthropicResponse(
  key: string,
): AnthropicMessage | undefined {
  const cached = recentAnthropicResponses.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt < Date.now()) {
    recentAnthropicResponses.delete(key);
    return undefined;
  }
  return cached.response;
}

function cacheAnthropicResponse(key: string, response: AnthropicMessage): void {
  recentAnthropicResponses.set(key, {
    response,
    expiresAt: Date.now() + DEDUPE_TTL_MS,
  });
}

// Middleware con limite de 50MB
app.use(express.json({ limit: "50mb" }));

// Health check - Verifica estado del servicio multimodal
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "cortex-multimodal-proxy",
    version: packageJson.version,
    uptime: process.uptime(),
    capabilities: ["text", "image", "audio", "video", "pdf"],
    max_file_size_mb: parseInt(process.env.MAX_FILE_SIZE_MB || "50"),
    providers: getActiveProviderInfo(),
  });
});

function createOpenAIResponseFromText(
  content: string,
  model: string,
): ChatCompletionResponse {
  const now = Math.floor(Date.now() / 1000);
  const completionTokens = Math.ceil(content.length / 4);
  return {
    id: `chatcmpl-${randomUUID()}`,
    object: "chat.completion",
    created: now,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: completionTokens,
      total_tokens: completionTokens,
    },
  };
}

async function* createOpenAIStreamFromText(
  content: string,
  model: string,
  id: string,
): AsyncGenerator<string> {
  const now = Math.floor(Date.now() / 1000);

  const startChunk = {
    id,
    object: "chat.completion.chunk",
    created: now,
    model,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  };
  yield `data: ${JSON.stringify(startChunk)}\n\n`;

  if (content) {
    const contentChunk = {
      id,
      object: "chat.completion.chunk",
      created: now,
      model,
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    };
    yield `data: ${JSON.stringify(contentChunk)}\n\n`;
  }

  const endChunk = {
    id,
    object: "chat.completion.chunk",
    created: now,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  };
  yield `data: ${JSON.stringify(endChunk)}\n\n`;
  yield "data: [DONE]\n\n";
}

function extractAssistantContent(messages: ChatMessage[]): string {
  const msg = messages[0];
  if (!msg?.content) return "";

  if (typeof msg.content === "string") return msg.content;

  if (Array.isArray(msg.content)) {
    const textParts = msg.content
      .filter((part: any) => part.type === "text" && part.text)
      .map((part: any) => part.text)
      .join("\n\n");
    return textParts || JSON.stringify(msg.content);
  }

  return JSON.stringify(msg.content);
}

function tryRecord(payload: RecordRequestPayload): void {
  try {
    dashboardService.recordRequest(payload);
  } catch (err) {
    logger.warn(`dashboardService.recordRequest fallo: ${getErrorMessage(err)}`);
  }
}

function extractUsageFromChunk(chunk: string): {
  prompt: number;
  completion: number;
  total: number;
} {
  let prompt = 0;
  let completion = 0;
  let total = 0;
  for (const line of chunk.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const body = trimmed.slice(5).trim();
    if (!body || body === "[DONE]") continue;
    try {
      const parsed = JSON.parse(body);
      const u =
        parsed.usage ??
        parsed.message?.usage ??
        (parsed.type === "message_delta" ? parsed.usage : null);
      if (u && typeof u === "object") {
        if (typeof u.input_tokens === "number") {
          prompt = Math.max(prompt, u.input_tokens);
          completion = Math.max(completion, u.output_tokens ?? 0);
        } else {
          if (typeof u.prompt_tokens === "number")
            prompt = Math.max(prompt, u.prompt_tokens);
          if (typeof u.completion_tokens === "number")
            completion = Math.max(completion, u.completion_tokens);
        }
        if (typeof u.total_tokens === "number")
          total = Math.max(total, u.total_tokens);
      }
    } catch {
      // ignore malformed chunks
    }
  }
  if (total === 0) total = prompt + completion;
  return { prompt, completion, total };
}

function computeCost(
  brain: BrainModelEntry | null,
  promptTokens: number,
  completionTokens: number,
): number {
  if (!brain) return 0;
  return (
    (promptTokens / 1_000_000) * brain.inputPrice +
    (completionTokens / 1_000_000) * brain.outputPrice
  );
}

// Cache stats
app.get("/v1/cache/stats", async (req: Request, res: Response) => {
  try {
    const stats = await cacheService.getStats();
    res.json(stats);
  } catch (error: unknown) {
    logger.error("Error obteniendo stats de cache:", error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Dashboard routes (static + snapshot)
mountDashboardRoutes(app, { startTime: SERVER_START_TIME });

// Models endpoint - Lista modelos multimodales disponibles
// Compatible 100% con OpenAI API
app.get("/v1/models", (req: Request, res: Response) => {
  const isAnthropicClient = req.headers["anthropic-version"] !== undefined;

  if (isAnthropicClient) {
    logger.info("GET /v1/models (cliente: Claude Code)");
    res.json({
      object: "list",
      data: getClaudeCodeModelsList(),
    });
    return;
  }

  logger.info("GET /v1/models (cliente: OpenCode)");
  res.json({
    object: "list",
    data: getOpenCodeModelsList(),
  });
});

const MINIMAX_PASSTHROUGH_INPUT_PRICE = parseFloat(
  process.env.MINIMAX_INPUT_PRICE || "0",
);
const MINIMAX_PASSTHROUGH_OUTPUT_PRICE = parseFloat(
  process.env.MINIMAX_OUTPUT_PRICE || "0",
);

function resolveBrainServiceEntry(modelId: string): BrainModelEntry | null {
  // Per-model passthrough pricing. mimo-v2.5 is subscription-based
  // (OpenCode Go) so the user already pays the flat fee; the dashboard
  // records 0 USD. MiniMax-M3 is per-token via MINIMAX_API_KEY, so its
  // input/output prices are configurable via env vars (default 0 keeps
  // backward compatibility for setups that don't want to track cost).
  const passthroughPrices: Record<string, { in: number; out: number }> = {
    "mimo-v2.5": { in: 0, out: 0 },
    "MiniMax-M3": {
      in: MINIMAX_PASSTHROUGH_INPUT_PRICE,
      out: MINIMAX_PASSTHROUGH_OUTPUT_PRICE,
    },
  };
  const prices = passthroughPrices[modelId] ?? { in: 0, out: 0 };
  const passthroughEntry: BrainModelEntry = {
    upstream: modelId,
    context: 1048576,
    maxOutput: 131072,
    thinking: true,
    inputPrice: prices.in,
    outputPrice: prices.out,
    endpoint: "openai",
    multimodal: true,
  };

  if (isPassthrough(modelId)) return passthroughEntry;
  return getBrainEntry(modelId) || null;
}

// Chat completions - Endpoint principal compatible OpenAI
// Arquitectura "Cortex Sensorial v3": MiMo V2.5 senses + multi-brain router
app.post("/v1/chat/completions", async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const request = req.body as ChatCompletionRequest;
    const model = request.model;

    logger.info(
      `POST /v1/chat/completions | model: ${model} | stream: ${request.stream || false} | tools: ${!!request.tools}`,
    );

    if (!Object.hasOwn(getActiveBrainModels(), model) && !PASSTHROUGH_MODELS.has(model)) {
      const allKnown = [
        ...Object.keys(getActiveBrainModels()),
        ...Array.from(PASSTHROUGH_MODELS),
      ];
      res.status(400).json({
        error: {
          message: `Modelo desconocido: ${model}. Modelos válidos: ${allKnown.join(", ")}`,
          type: "invalid_request_error",
        },
      });
      return;
    }

    const brainEntry = resolveBrainServiceEntry(model);
    if (!brainEntry) {
      res.status(400).json({
        error: {
          message: `No se pudo resolver brain para modelo: ${model}`,
          type: "invalid_request_error",
        },
      });
      return;
    }

    const { processedMessages, strategy } = await processMultimodalContent(
      request.messages,
      model,
      brainEntry,
      getActiveVisionProvider(),
    );
    res.setHeader("X-Multimodal-Strategy", strategy);
    const strategyForRecord: Strategy = strategy;

    if (isPassthrough(model)) {
      logger.info(`Passthrough: ${model} (nativamente multimodal)`);
    } else if (strategy === "direct") {
      logger.info(`Brain directo: ${brainEntry.upstream}`);
    } else {
      logger.info(`Brain: ${brainEntry.upstream} via ${strategy}`);
    }

    const processedRequest: ChatCompletionRequest = {
      ...request,
      messages: processedMessages,
    };

    if (request.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let clientClosed = false;
      const abortController = new AbortController();
      let lastChunk = "";
      let streamError: unknown = null;
      const safeWrite = (chunk: string): void => {
        if (clientClosed || res.writableEnded || res.destroyed) return;
        try {
          res.write(chunk);
        } catch (err) {
          logger.warn(
            `Stream write failed (client likely disconnected): ${getErrorMessage(err)}`,
          );
          clientClosed = true;
        }
      };
      const safeEnd = (): void => {
        if (clientClosed || res.writableEnded || res.destroyed) return;
        try {
          res.end();
        } catch (err) {
          logger.warn(`Stream end failed: ${getErrorMessage(err)}`);
          clientClosed = true;
        }
      };

      res.on("close", () => {
        if (clientClosed) return;
        clientClosed = true;
        abortController.abort();
        logger.warn(
          `Client disconnected mid-stream | ${brainEntry.upstream}`,
        );
      });

      await getActiveBrainProviderFor(model).chatCompletionStream(
        processedRequest,
        brainEntry,
        (chunk) => {
          lastChunk += chunk;
          safeWrite(chunk);
        },
        (error) => {
          streamError = error;
          const errorResponse: ErrorResponse = {
            error: {
              message: getErrorMessage(error),
              type: "proxy_error",
            },
          };
          safeWrite(`data: ${JSON.stringify(errorResponse)}\n\n`);
          safeEnd();
        },
        () => {
          safeWrite("data: [DONE]\n\n");
          safeEnd();
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          logger.info(
            `✓ Request stream completado (${elapsed}s) | ${brainEntry.upstream}`,
          );
          const usage = extractUsageFromChunk(lastChunk);
          tryRecord({
            ts: Date.now(),
            model,
            brain: brainEntry.upstream,
            strategy: strategyForRecord,
            promptTokens: usage.prompt,
            completionTokens: usage.completion,
            totalTokens: usage.total,
            costUsd: computeCost(brainEntry, usage.prompt, usage.completion),
            latencyMs: Date.now() - startTime,
            status: streamError ? "error" : "ok",
            cacheHit: 0,
            client: "openai",
          });
        },
        abortController.signal,
      );
    } else {
      const response = await getActiveBrainProviderFor(model).createChatCompletion(
        processedRequest,
        brainEntry,
      );
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(
        `✓ Request completado (${elapsed}s) | ${brainEntry.upstream}`,
      );
      const usage = response.usage ?? {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };
      tryRecord({
        ts: Date.now(),
        model,
        brain: brainEntry.upstream,
        strategy: strategyForRecord,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        costUsd: computeCost(
          brainEntry,
          usage.prompt_tokens,
          usage.completion_tokens,
        ),
        latencyMs: Date.now() - startTime,
        status: "ok",
        cacheHit: 0,
        client: "openai",
      });
      res.json(response);
    }
  } catch (error: unknown) {
    logger.error("Error procesando request:", error);

    tryRecord({
      ts: Date.now(),
      model: req.body?.model ?? "unknown",
      brain: "unknown",
      strategy: "direct",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      latencyMs: Date.now() - startTime,
      status: "error",
      cacheHit: 0,
      client: "openai",
    });

    const errorResponse: ErrorResponse = {
      error: {
        message: getErrorMessage(error) || "Error interno del proxy",
        type: "proxy_error",
      },
    };

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
    } else {
      res.status(500).json(errorResponse);
    }
  }
});

app.post("/v1/messages", async (req: Request, res: Response) => {
  const startTime = Date.now();
  let requestKey = "";
  let contentKey = "";
  let deferred: Deferred<AnthropicMessage> | null = null;
  const requestId = randomUUID();
  const clientKind: ClientKind = "anthropic";

  try {
    const anthropicRequest = req.body as AnthropicRequest;
    const originalModel = anthropicRequest.model;
    contentKey = getAnthropicContentKey(anthropicRequest);

    if (originalModel === "haiku" && HAIKU_DEFER_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, HAIKU_DEFER_MS));
      const contentInFlight = inFlightAnthropicByContent.get(contentKey);
      if (contentInFlight) {
        logger.info(
          `Haiku defer dedupe (content) | request_id: ${requestId} | model: ${originalModel}`,
        );
        const response = await contentInFlight;
        res.setHeader(
          "anthropic-version",
          req.headers["anthropic-version"] || "2023-06-01",
        );
        tryRecord({
          ts: Date.now(),
          model: originalModel,
          brain: "in-flight-dedupe",
          strategy: "direct",
          promptTokens: response.usage?.input_tokens ?? 0,
          completionTokens: response.usage?.output_tokens ?? 0,
          totalTokens:
            (response.usage?.input_tokens ?? 0) +
            (response.usage?.output_tokens ?? 0),
          costUsd: 0,
          latencyMs: Date.now() - startTime,
          status: "ok",
          cacheHit: 1,
          client: clientKind,
        });
        res.json(response);
        return;
      }
    }
    requestKey = getAnthropicRequestKey(anthropicRequest);

    const cachedResponse = getCachedAnthropicResponse(requestKey);
    if (cachedResponse) {
      logger.info(
        `Cache HIT (Anthropic dedupe) | request_id: ${requestId} | model: ${originalModel}`,
      );
      tryRecord({
        ts: Date.now(),
        model: originalModel,
        brain: "anthropic-dedupe",
        strategy: "direct",
        promptTokens: cachedResponse.usage?.input_tokens ?? 0,
        completionTokens: cachedResponse.usage?.output_tokens ?? 0,
        totalTokens:
          (cachedResponse.usage?.input_tokens ?? 0) +
          (cachedResponse.usage?.output_tokens ?? 0),
        costUsd: 0,
        latencyMs: Date.now() - startTime,
        status: "ok",
        cacheHit: 1,
        client: clientKind,
      });
      if (anthropicRequest.stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader(
          "anthropic-version",
          req.headers["anthropic-version"] || "2023-06-01",
        );

        const content = cachedResponse.content
          .map((block) => (block.type === "text" ? block.text || "" : ""))
          .join("");
        const openaiStream = createOpenAIStreamFromText(
          content,
          originalModel,
          `chatcmpl-${randomUUID()}`,
        );
        const anthropicStream = anthropicAdapter.createAnthropicStream(
          openaiStream,
          originalModel,
          randomUUID(),
        );

        for await (const event of anthropicStream) {
          res.write(event);
        }

        res.end();
      } else {
        res.setHeader(
          "anthropic-version",
          req.headers["anthropic-version"] || "2023-06-01",
        );
        res.json(cachedResponse);
      }
      return;
    }

    const existing = inFlightAnthropic.get(requestKey);
    if (existing) {
      logger.info(
        `In-flight dedupe (Anthropic) | request_id: ${requestId} | model: ${originalModel}`,
      );
      const response = await existing;
      tryRecord({
        ts: Date.now(),
        model: originalModel,
        brain: "in-flight-dedupe",
        strategy: "direct",
        promptTokens: response.usage?.input_tokens ?? 0,
        completionTokens: response.usage?.output_tokens ?? 0,
        totalTokens:
          (response.usage?.input_tokens ?? 0) +
          (response.usage?.output_tokens ?? 0),
        costUsd: 0,
        latencyMs: Date.now() - startTime,
        status: "ok",
        cacheHit: 1,
        client: clientKind,
      });
      if (anthropicRequest.stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader(
          "anthropic-version",
          req.headers["anthropic-version"] || "2023-06-01",
        );

        const content = response.content
          .map((block) => (block.type === "text" ? block.text || "" : ""))
          .join("");
        const openaiStream = createOpenAIStreamFromText(
          content,
          originalModel,
          `chatcmpl-${randomUUID()}`,
        );
        const anthropicStream = anthropicAdapter.createAnthropicStream(
          openaiStream,
          originalModel,
          randomUUID(),
        );

        for await (const event of anthropicStream) {
          res.write(event);
        }

        res.end();
      } else {
        res.setHeader(
          "anthropic-version",
          req.headers["anthropic-version"] || "2023-06-01",
        );
        res.json(response);
      }
      return;
    }

    deferred = createDeferred<AnthropicMessage>();
    inFlightAnthropic.set(requestKey, deferred.promise);
    if (originalModel !== "haiku") {
      inFlightAnthropicByContent.set(contentKey, deferred.promise);
    }

    logger.info(
      `POST /v1/messages | request_id: ${requestId} | model: ${originalModel} | stream: ${anthropicRequest.stream || false}`,
    );

    const openaiRequest = anthropicAdapter.anthropicToInternal(anthropicRequest);
    const internalModel = openaiRequest.model;

    const { internalModel: mappedModel, strategy: claudeStrategy } =
      getClaudeModelMapping(originalModel);
    openaiRequest.model = mappedModel;
    logger.info(
      `Mapping Claude ${originalModel} → ${mappedModel} (${claudeStrategy})`,
    );

    const brainEntry = resolveBrainServiceEntry(mappedModel);
    if (!brainEntry) {
      throw new Error(`Modelo interno invalido: ${mappedModel}`);
    }

    let processedMessages = openaiRequest.messages;
    let strategy:
      | "direct"
      | "vision"
      | "vision-mimo"
      | "mixed"
      | "local" = "direct";

    if (claudeStrategy === "passthrough") {
      strategy = "direct";
      logger.info(
        `${originalModel}: Passthrough a ${mappedModel} (nativamente multimodal)`,
      );
    } else {
      const { processedMessages: pm, strategy: st } =
        await processMultimodalContent(
          openaiRequest.messages,
          mappedModel,
          brainEntry,
          getActiveVisionProvider(),
        );
      processedMessages = pm;
      strategy = st;
      logger.info(
        `${originalModel}: Routing interno (${strategy}) | request_id: ${requestId}`,
      );
    }

    res.setHeader("X-Multimodal-Strategy", strategy);

    const processedRequest: ChatCompletionRequest = {
      ...openaiRequest,
      messages: processedMessages,
    };

    if (anthropicRequest.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader(
        "anthropic-version",
        req.headers["anthropic-version"] || "2023-06-01",
      );

      const requestId = randomUUID();

      async function* openaiChunksGenerator() {
        const chunks: string[] = [];
        let resolvePromise: (value: void) => void;
        const completionPromise = new Promise<void>((resolve) => {
          resolvePromise = resolve;
        });

        await getActiveBrainProviderFor(openaiRequest.model).chatCompletionStream(
          processedRequest,
          brainEntry!,
          (chunk) => {
            chunks.push(chunk);
          },
          (error) => {
            throw error;
          },
          () => {
            resolvePromise();
          },
        );

        await completionPromise;

        let buffer = "";
        for (const chunk of chunks) {
          buffer += chunk;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim()) yield line;
          }
        }

        if (buffer.trim()) yield buffer;
      }

      const anthropicStream = anthropicAdapter.createAnthropicStream(
        openaiChunksGenerator(),
        originalModel,
        requestId,
        (finalContent) => {
          const openaiResponse = createOpenAIResponseFromText(
            finalContent,
            openaiRequest.model,
          );
          const anthropicResponse = anthropicAdapter.internalToAnthropic(
            openaiResponse,
            originalModel,
          );
          cacheAnthropicResponse(requestKey, anthropicResponse);
          if (deferred) deferred.resolve(anthropicResponse);
        },
      );

      let accumulatedChunks = "";
      for await (const event of anthropicStream) {
        accumulatedChunks += event;
        res.write(event);
      }

      res.end();
      inFlightAnthropic.delete(requestKey);
      inFlightAnthropicByContent.delete(contentKey);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(
        `OK Request stream Anthropic completado (${elapsed}s total) | request_id: ${requestId} | internal: ${internalModel}`,
      );
      const usage = extractUsageFromChunk(accumulatedChunks);
      tryRecord({
        ts: Date.now(),
        model: originalModel,
        brain: brainEntry!.upstream,
        strategy,
        promptTokens: usage.prompt,
        completionTokens: usage.completion,
        totalTokens: usage.total,
        costUsd: computeCost(brainEntry!, usage.prompt, usage.completion),
        latencyMs: Date.now() - startTime,
        status: "ok",
        cacheHit: 0,
        client: clientKind,
      });
      return;
    }

    const openaiResponse = await getActiveBrainProviderFor(openaiRequest.model).createChatCompletion(
      processedRequest,
      brainEntry!,
    );

    const anthropicResponse = anthropicAdapter.internalToAnthropic(
      openaiResponse,
      originalModel,
    );

    res.setHeader(
      "anthropic-version",
      req.headers["anthropic-version"] || "2023-06-01",
    );
    res.json(anthropicResponse);
    cacheAnthropicResponse(requestKey, anthropicResponse);
    if (deferred) deferred.resolve(anthropicResponse);
    inFlightAnthropic.delete(requestKey);
    inFlightAnthropicByContent.delete(contentKey);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(
      `OK Request Anthropic completado (${elapsed}s total) | request_id: ${requestId} | internal: ${internalModel}`,
    );
    const usage = anthropicResponse.usage ?? {
      input_tokens: 0,
      output_tokens: 0,
    };
    tryRecord({
      ts: Date.now(),
      model: originalModel,
      brain: brainEntry!.upstream,
      strategy,
      promptTokens: usage.input_tokens,
      completionTokens: usage.output_tokens,
      totalTokens: usage.input_tokens + usage.output_tokens,
      costUsd: computeCost(
        brainEntry!,
        usage.input_tokens,
        usage.output_tokens,
      ),
      latencyMs: Date.now() - startTime,
      status: "ok",
      cacheHit: 0,
      client: clientKind,
    });
  } catch (error: unknown) {
    if (deferred) deferred.reject(error);
    if (requestKey) inFlightAnthropic.delete(requestKey);
    inFlightAnthropicByContent.delete(contentKey);
    logger.error("Error procesando request Anthropic:", error);

    tryRecord({
      ts: Date.now(),
      model: req.body?.model ?? "unknown",
      brain: "unknown",
      strategy: "direct",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      latencyMs: Date.now() - startTime,
      status: "error",
      cacheHit: 0,
      client: clientKind,
    });

    const errorResponse: AnthropicError = {
      type: "error",
      error: {
        type: "api_error",
        message: getErrorMessage(error) || "Error interno del proxy",
      },
    };

    if (res.headersSent) {
      res.write(`event: error\ndata: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
    } else {
      res.status(500).json(errorResponse);
    }
  }
});

app.post("/", (req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

app.post("/api/event_logging/batch", (req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      message: `Ruta no encontrada: ${req.method} ${req.path}`,
      type: "not_found",
    },
  });
});

// Inicialización del proxy multimodal
async function init() {
  try {
    logger.info("Iniciando Cortex Multimodal Proxy v3...");
    logger.info(
      "Arquitectura 'Cortex Sensorial v3': 4 brains via OpenCode Go (glm-5.2, deepseek-v4-pro, qwen3.7-max, mimo-v2.5-pro) + 1 passthrough (mimo-v2.5)",
    );
    await cacheService.init();
    await dashboardService.init();

    return new Promise<void>((resolve) => {
      const server = app.listen(PORT, () => {
        const addr = server.address();
        const boundPort =
          typeof addr === "object" && addr ? addr.port : PORT;
        logger.info(
          `Servidor multimodal escuchando en http://localhost:${boundPort}`,
        );
        logger.info(`Health check: http://localhost:${boundPort}/health`);
        logger.info(`Modelos: http://localhost:${boundPort}/v1/models`);
        logger.info(
          `Capacidades: texto, imagenes (MiMo), audio/video/PDF (Gemini fallback)`,
        );
        logger.info(
          `Limite por archivo: ${process.env.MAX_FILE_SIZE_MB || "50"}MB`,
        );
        logger.info(
          `  Brains: ${Object.keys(getActiveBrainModels()).join(", ")} (max thinking)`,
        );
        logger.info(
          `  Passthrough: ${Array.from(PASSTHROUGH_MODELS).join(", ")} (multimodal nativo)`,
        );
        logger.info(
          `  Senses: MiMo V2.5 para imagenes | Gemini fallback: ${process.env.GEMINI_MODEL || "gemini-2.5-flash"}`,
        );
        logger.info(
          `  Dashboard: http://localhost:${boundPort}/dashboard/`,
        );
        resolve();
      });
    });
  } catch (error) {
    logger.error(
      "Error fatal al iniciar proxy multimodal:",
      getErrorMessage(error),
    );
    process.exit(1);
  }
}

export { app, init };

// Manejo de señales
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

if (require.main === module) {
  void init();
}
