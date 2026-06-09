# Definitive Guide: Claude Code Implementation in DeepSeek Multimodal Proxy

Status: implemented.

> **Self-contained document** for implementing full Claude Code (Anthropic API) support in the current proxy, maintaining absolute compatibility with OpenCode (OpenAI API).

## 📋 Table of Contents

1. [Current Proxy State](#1-current-proxy-state)
2. [Existing Architecture](#2-existing-architecture)
3. [Implementation Objective](#3-implementation-objective)
4. [gemini-direct Model](#4-gemini-direct-model)
5. [Anthropic Types and Structures](#5-anthropic-types-and-structures)
6. [Translation Adapter](#6-translation-adapter)
7. [Endpoints and Handlers](#7-endpoints-and-handlers)
8. [Step-by-Step Implementation](#8-step-by-step-implementation)
9. [Testing and Verification](#9-testing-and-verification)
10. [Transformation Examples](#10-transformation-examples)

---

## 1. Current Proxy State

### 1.1 Overview

The **DeepSeek Multimodal Proxy** is an HTTP server implementing the "Sensory Cortex" architecture:

- **DeepSeek** = Brain (reasoning, logic, code)
- **Gemini** = Senses (multimodal perception: images, audio, video, PDFs)
- **Proxy** = Cortex (automatic intelligent routing)

### 1.2 Current Endpoints (OpenAI-compatible)

```
GET  /health                    # Service status
GET  /v1/models                 # List available models
GET  /v1/cache/stats            # Cache statistics
POST /v1/chat/completions       # Multimodal chat (OpenAI API)
```

### 1.3 Currently Exposed Models

```json
[
  {
    "id": "deepseek-multimodal-chat",
    "owned_by": "deepseek-proxy",
    "root": "deepseek-chat"
  },
  {
    "id": "deepseek-multimodal-reasoner",
    "owned_by": "deepseek-proxy",
    "root": "deepseek-reasoner"
  }
]
```

### 1.4 Current File Structure

```
src/
├── index.ts                          # Express server + OpenAI endpoints
├── types/
│   └── openai.ts                     # OpenAI interfaces (ChatMessage, etc.)
├── middleware/
│   ├── multimodalProcessor.ts        # Sensory cortex (intelligent routing)
│   └── multimodalDetector.ts         # Content type detector
├── services/
│   ├── deepseekService.ts            # DeepSeek client (brain)
│   ├── geminiService.ts              # Gemini client (senses)
│   └── cacheService.ts               # SHA-256 cache system
└── utils/
    ├── downloader.ts                 # File download and validation
    ├── pdfProcessor.ts               # Local PDF processing
    └── hashGenerator.ts              # Contextual hash (content + question)
```

### 1.5 Current Configuration (.env)

```bash
# Server
PORT=7777

# Gemini (Senses)
GEMINI_API_KEY=xxx
GEMINI_MODEL=gemini-2.5-flash-lite

# DeepSeek (Brain)
DEEPSEEK_API_KEY=xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_CONTEXT_WINDOW_CHAT=100000
DEEPSEEK_MAX_OUTPUT_CHAT=8000
DEEPSEEK_CONTEXT_WINDOW_REASONER=100000
DEEPSEEK_MAX_OUTPUT_REASONER=64000

# Cache
CACHE_ENABLED=true
CACHE_DIR=./cache
CACHE_TTL_DAYS=7

# Limits
MAX_FILE_SIZE_MB=50
PDF_LOCAL_PROCESSING=true
PDF_LOCAL_MAX_SIZE_MB=1
```

---

## 2. Existing Architecture

### 2.1 Current Request Flow (OpenCode → OpenAI API)

```
OpenCode Client
    ↓ POST /v1/chat/completions (OpenAI format)
src/index.ts (Express handler)
    ↓ ChatCompletionRequest
multimodalProcessor.ts (intelligent routing)
    ├─ Text only → DeepSeek direct (passthrough)
    ├─ Multimedia → downloader.ts → validation
    │   ├─ Images/Audio/Video → geminiService.ts → description
    │   └─ Small PDFs → pdfProcessor.ts → text
    │       └─ Large PDFs → geminiService.ts → description
    ↓ Messages enriched with descriptions
deepseekService.ts
    ↓ Request to DeepSeek API
deepseekService.ts
    ↓ Response OpenAI format
OpenCode Client
```

### 2.2 Sensory Cortex - Intelligent Routing

The file `multimodalProcessor.ts` implements the core logic:

```typescript
export async function processMultimodalContent(
  messages: ChatMessage[],
): Promise<{
  processedMessages: ChatMessage[];
  useDeepseekDirectly: boolean;
  strategy: "direct" | "gemini" | "local" | "mixed";
}> {
  // 1. Detect content types
  const analysis = await detectMultimodalContent(messages);

  // 2. If text only → DeepSeek direct
  if (analysis.hasOnlyText) {
    return {
      processedMessages: messages,
      useDeepseekDirectly: true,
      strategy: "direct",
    };
  }

  // 3. Separate content by destination
  const geminiContent = await getGeminiRequiredContent(
    analysis.detectedContent,
  );
  const localContent = await getLocalProcessingContent(
    analysis.detectedContent,
  );

  // 4. Process with Gemini and/or locally
  const geminiDescriptions = await Promise.all(
    geminiContent.map((content) =>
      geminiService.analyzeContent(content, userContext),
    ),
  );

  const localDescriptions = await Promise.all(
    localContent.map(async (content) => {
      try {
        return await pdfProcessor.analyzePDF(buffer, userContext);
      } catch {
        // Fallback to Gemini if local processing fails
        return await geminiService.analyzeContent(content, userContext);
      }
    }),
  );

  // 5. Inject descriptions into messages
  // ... (content replacement logic)

  return { processedMessages, useDeepseekDirectly: false, strategy };
}
```

### 2.3 Contextual Cache System

```typescript
// Generates unique hash: SHA-256(content + user question)
const cacheKey = generateContextualHash(buffer, userContext);
const cached = await cacheService.get(cacheKey);
if (cached) return cached; // Avoids repeated Gemini calls
```

### 2.4 Current OpenAI Types

```typescript
// src/types/openai.ts
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | MessageContent[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface MessageContent {
  type:
    | "text"
    | "image_url"
    | "audio_url"
    | "video_url"
    | "document_url"
    | "image"
    | "file";
  text?: string;
  image_url?: { url: string; detail?: "auto" | "low" | "high" };
  audio_url?: { url: string; format?: string };
  // ...
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  stream?: boolean;
  tools?: any[];
  tool_choice?: any;
  // ...
}
```

---

## 3. Implementation Objective

### 3.1 Main Goal

Enable **Claude Code CLI** (which uses the Anthropic Messages API) to use this proxy as a backend, maintaining **100% compatibility with OpenCode**.

### 3.2 Models Claude Code Will Expect

```
haiku   → gemini-direct (new model)
sonnet  → deepseek-multimodal-chat
opus    → deepseek-multimodal-reasoner
```

### 3.3 New Endpoints Required

```
POST /v1/messages                  # Anthropic Messages API support
GET  /v1/models (Anthropic mode)   # List Claude models
POST /                             # Claude Code CLI heartbeats
POST /api/event_logging/batch      # Claude Code CLI telemetry (ignore)
```

### 3.4 Absolute Compatibility

- ✅ OpenCode keeps using `/v1/chat/completions` (OpenAI API)
- ✅ Claude Code will use `/v1/messages` (Anthropic API)
- ✅ Both share the same sensory cortex (Gemini + cache)
- ✅ No environment variables to enable/disable (always available)
- ✅ Fake ANTHROPIC_API_KEY (the proxy accepts any value)

---

## 4. gemini-direct Model

### 4.1 What is gemini-direct?

A **new virtual model** that completely bypasses DeepSeek and uses **only Gemini** to generate responses.

### 4.2 Why is it necessary?

- Haiku is Anthropic's "fast and cheap" model
- Mapping it to `deepseek-chat` would add unnecessary latency
- Using Gemini direct is faster and cheaper for that profile

### 4.3 Configuration

```bash
# .env (unchanged)
GEMINI_MODEL=gemini-2.5-flash-lite  # Will be the model used by gemini-direct
```

### 4.4 gemini-direct Routing

```typescript
// Modification in multimodalProcessor.ts
export async function processMultimodalContent(
  messages: ChatMessage[],
  modelName: string // NEW PARAMETER
): Promise<...> {
  // If model is gemini-direct, only use Gemini to respond
  if (modelName === "gemini-direct") {
    // Process EVERYTHING with Gemini (don't send to DeepSeek)
    const geminiResponse = await geminiService.generateDirectResponse(messages);
    return {
      processedMessages: [{ role: "assistant", content: geminiResponse }],
      useDeepseekDirectly: false,
      strategy: "gemini-direct"
    };
  }

  // Rest of existing logic...
}
```

### 4.5 New Function in geminiService.ts

```typescript
// src/services/geminiService.ts
class GeminiService {
  // ... existing methods ...

  /**
   * Generates direct response with Gemini (without DeepSeek)
   * Used for the gemini-direct model (Claude Haiku)
   */
  async generateDirectResponse(messages: ChatMessage[]): Promise<string> {
    this.ensureClient();

    // Convert OpenAI messages to Gemini format
    const geminiMessages = messages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [
        {
          text:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content),
        },
      ],
    }));

    const model = this.client!.getGenerativeModel({
      model: this.modelName, // uses GEMINI_MODEL from .env
    });

    try {
      const chat = model.startChat({
        history: geminiMessages.slice(0, -1),
      });

      const lastMessage = geminiMessages[geminiMessages.length - 1];
      const result = await chat.sendMessage(lastMessage.parts);

      return result.response.text();
    } catch (error: any) {
      logger.error("Error in Gemini direct generation:", error);
      throw new Error(`Gemini error: ${error.message}`);
    }
  }
}
```

### 4.6 Exposition in /v1/models

```typescript
// src/index.ts - Add to model list
app.get("/v1/models", (req, res) => {
  res.json({
    object: "list",
    data: [
      // Existing models...
      { id: "deepseek-multimodal-chat", ... },
      { id: "deepseek-multimodal-reasoner", ... },

      // NEW MODEL
      {
        id: "gemini-direct",
        object: "model",
        created: 1706745600,
        owned_by: "gemini-proxy",
        permission: [],
        root: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
        parent: null,
      }
    ]
  });
});
```

---

## 5. Anthropic Types and Structures

### 5.1 Create src/types/anthropic.ts

```typescript
/**
 * Types for Anthropic Messages API
 * Ref: https://docs.anthropic.com/en/api/messages
 */

export interface AnthropicMessage {
  id: string;
  type: "message";
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AnthropicContentBlock {
  type: "text" | "image" | "tool_use" | "tool_result" | "thinking";
  text?: string;

  // Image block
  source?: {
    type: "base64" | "url";
    media_type: string;
    data: string;
  };

  // Tool use block
  id?: string;
  name?: string;
  input?: any;

  // Tool result block
  tool_use_id?: string;
  content?: string | AnthropicContentBlock[];
  is_error?: boolean;

  // Thinking block (for DeepSeek Reasoner)
  thinking?: string;
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicInputMessage[];
  max_tokens: number;
  metadata?: {
    user_id?: string;
  };
  stop_sequences?: string[];
  stream?: boolean;
  system?: string; // System prompt OUTSIDE the messages array
  temperature?: number;
  top_p?: number;
  top_k?: number;
  tools?: AnthropicTool[];
}

export interface AnthropicInputMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

// Streaming Events
export interface AnthropicStreamEvent {
  type:
    | "message_start"
    | "content_block_start"
    | "content_block_delta"
    | "content_block_stop"
    | "message_delta"
    | "message_stop"
    | "ping"
    | "error";

  message?: Partial<AnthropicMessage>;
  content_block?: AnthropicContentBlock;
  delta?: {
    type: "text_delta" | "input_json_delta";
    text?: string;
    partial_json?: string;
  };
  index?: number;
  usage?: {
    output_tokens: number;
  };
}

export interface AnthropicError {
  type: "error";
  error: {
    type:
      | "invalid_request_error"
      | "authentication_error"
      | "permission_error"
      | "not_found_error"
      | "rate_limit_error"
      | "api_error"
      | "overloaded_error";
    message: string;
  };
}
```

---

## 6. Translation Adapter

### 6.1 Create src/services/anthropicAdapter.ts

```typescript
import type {
  AnthropicRequest,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicTool,
  AnthropicStreamEvent,
} from "../types/anthropic";
import type {
  ChatCompletionRequest,
  ChatMessage,
  MessageContent,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from "../types/openai";
import { logger } from "../utils/logger";

/**
 * Adapter to translate between Anthropic API and OpenAI API
 * Allows Claude Code to use the proxy without changes to the sensory cortex
 */
class AnthropicAdapter {
  /**
   * Maps Claude models to proxy internal models
   */
  mapClaudeModelToInternal(claudeModel: string): string {
    const mapping: Record<string, string> = {
      "haiku": "gemini-direct",
      "sonnet": "deepseek-multimodal-chat",
      "opus": "deepseek-multimodal-reasoner",
    };

    const mapped = mapping[claudeModel];
    if (!mapped) {
      logger.warn(
        `Unknown Claude model: ${claudeModel}, using deepseek-multimodal-chat`,
      );
      return "deepseek-multimodal-chat";
    }

    logger.info(`Mapping: ${claudeModel} → ${mapped}`);
    return mapped;
  }

  /**
   * Translates Anthropic request to internal OpenAI format
   */
  anthropicToInternal(request: AnthropicRequest): ChatCompletionRequest {
    logger.info("🔄 Translating Anthropic → OpenAI request");

    // Map model
    const internalModel = this.mapClaudeModelToInternal(request.model);

    // Convert messages
    const messages: ChatMessage[] = [];

    // System prompt: In Anthropic it's a separate field, in OpenAI it's a message
    if (request.system) {
      messages.push({
        role: "system",
        content: request.system,
      });
    }

    // Convert each Anthropic message
    for (const anthropicMsg of request.messages) {
      const openaiMsg: ChatMessage = {
        role: anthropicMsg.role,
        content: this.convertAnthropicContent(anthropicMsg.content),
      };

      // Handle tool_use and tool_result
      if (Array.isArray(anthropicMsg.content)) {
        const toolUses = anthropicMsg.content.filter(
          (block) => block.type === "tool_use",
        );
        if (toolUses.length > 0) {
          openaiMsg.tool_calls = toolUses.map((block) => ({
            id: block.id!,
            type: "function",
            function: {
              name: block.name!,
              arguments: JSON.stringify(block.input),
            },
          }));
        }

        const toolResults = anthropicMsg.content.filter(
          (block) => block.type === "tool_result",
        );
        if (toolResults.length > 0) {
          // Tool results in Anthropic become role="tool" messages in OpenAI
          for (const toolResult of toolResults) {
            messages.push({
              role: "tool",
              content:
                typeof toolResult.content === "string"
                  ? toolResult.content
                  : JSON.stringify(toolResult.content),
              tool_call_id: toolResult.tool_use_id!,
            });
          }
          continue; // Don't add the original message, we've processed tool results
        }
      }

      messages.push(openaiMsg);
    }

    // Convert tools if they exist
    let tools: any[] | undefined = undefined;
    if (request.tools) {
      tools = request.tools.map(this.anthropicToolToOpenAI);
    }

    const openaiRequest: ChatCompletionRequest = {
      model: internalModel,
      messages,
      temperature: request.temperature,
      top_p: request.top_p,
      max_tokens: request.max_tokens,
      stream: request.stream || false,
      stop: request.stop_sequences,
      tools,
    };

    logger.debug(`Translated messages: ${messages.length} message(s)`);
    return openaiRequest;
  }

  /**
   * Converts Anthropic content to OpenAI format
   */
  private convertAnthropicContent(
    content: string | AnthropicContentBlock[],
  ): string | MessageContent[] {
    if (typeof content === "string") {
      return content;
    }

    // Convert content block array
    const openaiContent: MessageContent[] = [];

    for (const block of content) {
      if (block.type === "text") {
        openaiContent.push({
          type: "text",
          text: block.text!,
        });
      } else if (block.type === "image") {
        // Anthropic uses source.type="base64" or "url"
        if (block.source) {
          if (block.source.type === "base64") {
            openaiContent.push({
              type: "image_url",
              image_url: {
                url: `data:${block.source.media_type};base64,${block.source.data}`,
              },
            });
          } else if (block.source.type === "url") {
            openaiContent.push({
              type: "image_url",
              image_url: {
                url: block.source.data,
              },
            });
          }
        }
      }
      // tool_use and tool_result are handled at the top level
    }

    // If there's only one text block, return plain string
    if (openaiContent.length === 1 && openaiContent[0].type === "text") {
      return openaiContent[0].text!;
    }

    return openaiContent;
  }

  /**
   * Converts Anthropic tool to OpenAI format
   */
  private anthropicToolToOpenAI(tool: AnthropicTool): any {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: this.cleanJSONSchemaForAnthropic(tool.input_schema),
      },
    };
  }

  /**
   * Cleans JSON Schema for Anthropic (they may reject certain fields)
   * Based on lesson from opencode-antigravity-auth plugin
   */
  private cleanJSONSchemaForAnthropic(schema: any): any {
    if (!schema || typeof schema !== "object") return schema;

    const cleaned = { ...schema };

    // Remove fields that Anthropic may reject
    delete cleaned.$schema;
    delete cleaned.$defs;
    delete cleaned.additionalProperties;
    delete cleaned.$ref;
    delete cleaned.const;

    // Recursively clean properties
    if (cleaned.properties) {
      for (const key in cleaned.properties) {
        cleaned.properties[key] = this.cleanJSONSchemaForAnthropic(
          cleaned.properties[key],
        );
      }
    }

    return cleaned;
  }

  /**
   * Translates DeepSeek/Gemini response to Anthropic format
   */
  internalToAnthropic(
    openaiResponse: ChatCompletionResponse,
    originalModel: string,
  ): AnthropicMessage {
    logger.info("🔄 Translating OpenAI → Anthropic response");

    const choice = openaiResponse.choices[0];
    const message = choice.message;

    // Convert content
    const content: AnthropicContentBlock[] = [];

    // Main text
    if (message.content) {
      content.push({
        type: "text",
        text: message.content as string,
      });
    }

    // Tool calls
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        content.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments),
        });
      }
    }

    // Map finish_reason
    let stopReason: AnthropicMessage["stop_reason"] = "end_turn";
    if (choice.finish_reason === "length") stopReason = "max_tokens";
    else if (choice.finish_reason === "tool_calls") stopReason = "tool_use";

    const anthropicResponse: AnthropicMessage = {
      id: openaiResponse.id,
      type: "message",
      role: "assistant",
      content,
      model: originalModel,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: openaiResponse.usage?.prompt_tokens || 0,
        output_tokens: openaiResponse.usage?.completion_tokens || 0,
      },
    };

    return anthropicResponse;
  }

  /**
   * Generates Anthropic event stream from OpenAI chunks
   */
  async *createAnthropicStream(
    openaiChunks: AsyncGenerator<string>,
    originalModel: string,
    requestId: string,
  ): AsyncGenerator<string> {
    logger.info("🔄 Creating Anthropic stream from OpenAI chunks");

    let firstChunk = true;
    let totalContent = "";

    try {
      for await (const chunk of openaiChunks) {
        // Parse OpenAI chunk (format: "data: {...}\n\n")
        if (chunk.startsWith("data: [DONE]")) {
          break;
        }

        if (!chunk.startsWith("data: ")) continue;

        const jsonStr = chunk.slice(6);
        let parsed: ChatCompletionChunk;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        const delta = parsed.choices[0]?.delta;
        if (!delta) continue;

        // First chunk: message_start
        if (firstChunk) {
          const messageStart: AnthropicStreamEvent = {
            type: "message_start",
            message: {
              id: requestId,
              type: "message",
              role: "assistant",
              model: originalModel,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          };
          yield `event: message_start\ndata: ${JSON.stringify(messageStart)}\n\n`;

          const contentBlockStart: AnthropicStreamEvent = {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          };
          yield `event: content_block_start\ndata: ${JSON.stringify(contentBlockStart)}\n\n`;

          firstChunk = false;
        }

        // Incremental content
        if (delta.content) {
          totalContent += delta.content;

          const contentDelta: AnthropicStreamEvent = {
            type: "content_block_delta",
            index: 0,
            delta: {
              type: "text_delta",
              text: delta.content,
            },
          };
          yield `event: content_block_delta\ndata: ${JSON.stringify(contentDelta)}\n\n`;
        }

        // Finish reason
        if (parsed.choices[0]?.finish_reason) {
          const contentBlockStop: AnthropicStreamEvent = {
            type: "content_block_stop",
            index: 0,
          };
          yield `event: content_block_stop\ndata: ${JSON.stringify(contentBlockStop)}\n\n`;

          let stopReason: AnthropicMessage["stop_reason"] = "end_turn";
          if (parsed.choices[0].finish_reason === "length")
            stopReason = "max_tokens";
          else if (parsed.choices[0].finish_reason === "tool_calls")
            stopReason = "tool_use";

          const messageDelta: AnthropicStreamEvent = {
            type: "message_delta",
            delta: {},
            usage: { output_tokens: Math.ceil(totalContent.length / 4) }, // Estimate
          };
          yield `event: message_delta\ndata: ${JSON.stringify(messageDelta)}\n\n`;
        }
      }

      // Final: message_stop
      const messageStop: AnthropicStreamEvent = {
        type: "message_stop",
      };
      yield `event: message_stop\ndata: ${JSON.stringify(messageStop)}\n\n`;
    } catch (error: any) {
      logger.error("Error in Anthropic stream:", error);
      const errorEvent: AnthropicStreamEvent = {
        type: "error",
      };
      yield `event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`;
    }
  }

  /**
   * Maps DeepSeek reasoning_content to Anthropic thinking blocks
   */
  mapReasoningToThinking(reasoningContent: string): AnthropicContentBlock {
    return {
      type: "thinking",
      thinking: reasoningContent,
    };
  }
}

export const anthropicAdapter = new AnthropicAdapter();
```

---

## 7. Endpoints and Handlers

### 7.1 Modify src/index.ts - Add Anthropic Endpoints

```typescript
// ... existing imports ...
import { anthropicAdapter } from "./services/anthropicAdapter";
import type {
  AnthropicRequest,
  AnthropicMessage,
  AnthropicError,
} from "./types/anthropic";
import { randomUUID } from "crypto";

// ... existing endpoints (/health, /v1/cache/stats) ...

// ========================================
// ANTHROPIC ENDPOINTS (Claude Code)
// ========================================

/**
 * GET /v1/models (with client detection)
 * Detects if it's Claude Code (anthropic-version header) or OpenCode
 */
app.get("/v1/models", (req: Request, res: Response) => {
  const isAnthropicClient = req.headers["anthropic-version"] !== undefined;

  if (isAnthropicClient) {
    // Response for Claude Code
    logger.info("GET /v1/models (client: Claude Code)");
    res.json({
      object: "list",
      data: [
        {
          id: "haiku",
          object: "model",
          created: 1706745600,
          owned_by: "anthropic",
        },
        {
          id: "sonnet",
          object: "model",
          created: 1706745600,
          owned_by: "anthropic",
        },
        {
          id: "opus",
          object: "model",
          created: 1706745600,
          owned_by: "anthropic",
        },
      ],
    });
  } else {
    // Response for OpenCode (existing)
    logger.info("GET /v1/models (client: OpenCode)");
    res.json({
      object: "list",
      data: [
        {
          id: "deepseek-multimodal-chat",
          object: "model",
          created: 1706745600,
          owned_by: "deepseek-proxy",
          permission: [],
          root: "deepseek-chat",
          parent: null,
        },
        {
          id: "deepseek-multimodal-reasoner",
          object: "model",
          created: 1706745600,
          owned_by: "deepseek-proxy",
          permission: [],
          root: "deepseek-reasoner",
          parent: null,
        },
        {
          id: "gemini-direct",
          object: "model",
          created: 1706745600,
          owned_by: "gemini-proxy",
          permission: [],
          root: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
          parent: null,
        },
      ],
    });
  }
});

/**
 * POST /v1/messages - Anthropic Messages API
 * Main endpoint for Claude Code
 */
app.post("/v1/messages", async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const anthropicRequest = req.body as AnthropicRequest;
    const originalModel = anthropicRequest.model;

    logger.info(
      `POST /v1/messages | model: ${originalModel} | stream: ${anthropicRequest.stream || false}`,
    );

    // 1. Translate Anthropic → OpenAI
    const openaiRequest =
      anthropicAdapter.anthropicToInternal(anthropicRequest);

    // 2. Process multimodal content (sensory cortex)
    const { processedMessages, useDeepseekDirectly, strategy } =
      await processMultimodalContent(
        openaiRequest.messages,
        openaiRequest.model,
      );

    res.setHeader("X-Multimodal-Strategy", strategy);

    if (useDeepseekDirectly) {
      logger.info(
        "✓ Content supported by internal model - Direct passthrough",
      );
    } else {
      logger.info(
        `✓ Processed content (${strategy}) - Routing to internal model`,
      );
    }

    // 3. Create processed request
    const processedRequest: ChatCompletionRequest = {
      ...openaiRequest,
      messages: processedMessages,
    };

    // 4. Execute request (streaming or not)
    if (anthropicRequest.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader(
        "anthropic-version",
        req.headers["anthropic-version"] || "2023-06-01",
      );

      const requestId = randomUUID();

      // OpenAI chunks generator
      async function* openaiChunksGenerator() {
        let buffer = "";
        await deepseekService.chatCompletionStream(
          processedRequest,
          (chunk) => {
            buffer += chunk;
          },
          (error) => {
            throw error;
          },
          () => {
            // Stream completed
          },
        );
        // Parse buffer into chunks
        const lines = buffer.split("\n");
        for (const line of lines) {
          if (line.trim()) yield line;
        }
      }

      // Convert to Anthropic stream
      const anthropicStream = anthropicAdapter.createAnthropicStream(
        openaiChunksGenerator(),
        originalModel,
        requestId,
      );

      for await (const event of anthropicStream) {
        res.write(event);
      }

      res.end();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`✓ Anthropic stream request completed (${elapsed}s total)`);
    } else {
      // Non-streaming
      const openaiResponse = await deepseekService.createChatCompletion(
        processedRequest,
        processedMessages,
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

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`✓ Anthropic request completed (${elapsed}s total)`);
    }
  } catch (error: unknown) {
    logger.error("Error processing Anthropic request:", error);

    const errorResponse: AnthropicError = {
      type: "error",
      error: {
        type: "api_error",
        message: getErrorMessage(error) || "Internal proxy error",
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

/**
 * POST / - Claude Code CLI heartbeats
 * Claude Code sends periodic heartbeats, respond OK silently
 */
app.post("/", (req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

/**
 * POST /api/event_logging/batch - Claude Code CLI telemetry
 * Ignore and respond OK
 */
app.post("/api/event_logging/batch", (req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

// ... existing /v1/chat/completions endpoint ...
// ... rest of existing code ...
```

### 7.2 Modify processMultimodalContent to Support gemini-direct

```typescript
// src/middleware/multimodalProcessor.ts

export async function processMultimodalContent(
  messages: ChatMessage[],
  modelName?: string, // NEW OPTIONAL PARAMETER
): Promise<{
  processedMessages: ChatMessage[];
  useDeepseekDirectly: boolean;
  strategy: "direct" | "gemini" | "local" | "mixed" | "gemini-direct";
}> {
  // Special case: gemini-direct bypasses DeepSeek
  if (modelName === "gemini-direct") {
    logger.info(
      "🔮 gemini-direct model detected - Using Gemini for full response",
    );

    const geminiResponse = await geminiService.generateDirectResponse(messages);

    return {
      processedMessages: [
        {
          role: "assistant",
          content: geminiResponse,
        },
      ],
      useDeepseekDirectly: false,
      strategy: "gemini-direct",
    };
  }

  // Rest of existing logic...
  const analysis = await detectMultimodalContent(messages);
  // ... (unchanged)
}
```

---

## 8. Step-by-Step Implementation

### Phase 1: Types and gemini-direct Model

**Files to create:**

- `src/types/anthropic.ts` (Anthropic types)

**Files to modify:**

- `src/services/geminiService.ts` (add `generateDirectResponse()`)
- `src/index.ts` (add "gemini-direct" to `/v1/models` for OpenCode)
- `src/middleware/multimodalProcessor.ts` (add `model` parameter, gemini-direct logic)

**Steps:**

1. Copy the content of section 5.1 to `src/types/anthropic.ts`
2. Add `generateDirectResponse()` function to `geminiService.ts` (section 4.5)
3. Modify signature of `processMultimodalContent()` to accept `modelName?: string`
4. Add gemini-direct logic at the beginning of `processMultimodalContent()` (section 7.2)
5. Add "gemini-direct" model to the existing `/v1/models` endpoint (section 4.6)

**Phase 1 Verification:**

```bash
# Compile
npm run build

# Test with OpenCode that the model appears
curl http://localhost:7777/v1/models | jq '.data[] | select(.id=="gemini-direct")'

# Should return:
# {
#   "id": "gemini-direct",
#   "object": "model",
#   "owned_by": "gemini-proxy",
#   "root": "gemini-2.5-flash-lite",
#   ...
# }
```

---

### Phase 2: Translation Adapter

**Files to create:**

- `src/services/anthropicAdapter.ts`

**Steps:**

1. Copy all content from section 6.1 to `src/services/anthropicAdapter.ts`
2. Ensure all imports are correct
3. Compile and verify no TypeScript errors

**Phase 2 Verification:**

```bash
npm run build
# There should be no compilation errors
```

---

### Phase 3: Anthropic Endpoints

**Files to modify:**

- `src/index.ts` (add endpoints `/v1/messages`, `/`, `/api/event_logging/batch`)
- `src/index.ts` (modify `/v1/models` for client detection)

**Steps:**

1. Add Anthropic imports at the beginning of `src/index.ts`:

   ```typescript
   import { anthropicAdapter } from "./services/anthropicAdapter";
   import type {
     AnthropicRequest,
     AnthropicMessage,
     AnthropicError,
   } from "./types/anthropic";
   import { randomUUID } from "crypto";
   ```

2. Modify `/v1/models` endpoint for client detection (section 7.1)

3. Add `POST /v1/messages` endpoint (section 7.1)

4. Add silent endpoints (section 7.1):
   - `POST /`
   - `POST /api/event_logging/batch`

**Phase 3 Verification:**

```bash
npm run build
./scripts/manage.sh restart

# Test client detection in /v1/models
curl -H "anthropic-version: 2023-06-01" http://localhost:7777/v1/models | jq '.data[].id'
# Should return: haiku, sonnet, opus

curl http://localhost:7777/v1/models | jq '.data[].id'
# Should return: deepseek-multimodal-chat, deepseek-multimodal-reasoner, gemini-direct
```

---

### Phase 4: Manual Testing with Claude Code

**Configuration:**

```bash
export ANTHROPIC_BASE_URL="http://localhost:7777"
export ANTHROPIC_API_KEY="test"  # Any value, the proxy accepts it
claude --version
```

Optional config in `.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "test",
    "ANTHROPIC_API_KEY": "test",
    "ANTHROPIC_BASE_URL": "http://localhost:7777",
    "ANTHROPIC_MODEL": "sonnet",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "opus",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "sonnet",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "haiku",
    "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet",
    "ENABLE_EXPERIMENTAL_MCP_CLI": "true"
  },
  "model": "sonnet"
}
```

**Tests:**

1. **Test 1: Haiku (gemini-direct) - Text only**

   ```bash
   echo "Explain what an HTTP proxy is in 2 lines" | claude --model haiku
   ```

   - **Expected**: Response generated by Gemini direct
   - **Expected log**: `🔮 gemini-direct model detected`

2. **Test 2: Sonnet (deepseek-chat) - With image**

   ```bash
   # Prepare test image
   echo "Describe this image" > prompt.txt
   claude --model sonnet --image test.jpg < prompt.txt
   ```

   - **Expected**: Image processed by Gemini → description → DeepSeek
   - **Expected log**: `📊 Content detected: 1 item(s)`, `🔍 Processing image 1/1 with Gemini...`

3. **Test 3: Opus (deepseek-reasoner) - Reasoning**
   ```bash
   echo "Solve: If I have 3 apples and buy double what I have, how many do I have?" | \
     claude --model opus
   ```

   - **Expected**: Response with reasoning from DeepSeek Reasoner
   - **Expected log**: Model mapped to `deepseek-multimodal-reasoner`

---

### Phase 5: Automated Testing

**Create test/test-claude-code.js:**

```javascript
import axios from "axios";
import fs from "fs";

const BASE_URL = "http://localhost:7777";
const ANTHROPIC_VERSION = "2023-06-01";

async function testAnthropicModels() {
  console.log("🧪 Test 1: GET /v1/models (Anthropic client)");

  const res = await axios.get(`${BASE_URL}/v1/models`, {
    headers: { "anthropic-version": ANTHROPIC_VERSION },
  });

  const models = res.data.data.map((m) => m.id);
  console.log("  Models:", models);

  const expected = [
    "haiku",
    "sonnet",
    "opus",
  ];
  const allPresent = expected.every((m) => models.includes(m));

  console.log(allPresent ? "  ✅ PASS" : "  ❌ FAIL");
  return allPresent;
}

async function testHaikuTextOnly() {
  console.log("\n🧪 Test 2: Haiku (gemini-direct) - Text only");

  const res = await axios.post(
    `${BASE_URL}/v1/messages`,
    {
      model: "haiku",
      max_tokens: 100,
      messages: [{ role: "user", content: "Say 'hello world' and nothing else" }],
    },
    {
      headers: {
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
    },
  );

  console.log("  Response type:", res.data.type);
  console.log("  Content:", res.data.content[0]?.text?.substring(0, 50));
  console.log("  Strategy header:", res.headers["x-multimodal-strategy"]);

  const pass =
    res.data.type === "message" &&
    res.headers["x-multimodal-strategy"] === "gemini-direct";
  console.log(pass ? "  ✅ PASS" : "  ❌ FAIL");
  return pass;
}

async function testSonnetWithImage() {
  console.log("\n🧪 Test 3: Sonnet (deepseek-chat) - With image");

  // Generate test image (1x1 red pixel)
  const redPixel = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  const base64Image = redPixel.toString("base64");

  const res = await axios.post(
    `${BASE_URL}/v1/messages`,
    {
      model: "sonnet",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: base64Image,
              },
            },
            {
              type: "text",
              text: "What do you see in this image?",
            },
          ],
        },
      ],
    },
    {
      headers: {
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
    },
  );

  console.log("  Response type:", res.data.type);
  console.log("  Strategy header:", res.headers["x-multimodal-strategy"]);

  const pass =
    res.data.type === "message" &&
    ["gemini", "mixed"].includes(res.headers["x-multimodal-strategy"]);
  console.log(pass ? "  ✅ PASS" : "  ❌ FAIL");
  return pass;
}

async function runTests() {
  console.log("🚀 Starting Claude Code tests\n");

  const results = await Promise.all([
    testAnthropicModels(),
    testHaikuTextOnly(),
    testSonnetWithImage(),
  ]);

  const passed = results.filter(Boolean).length;
  console.log(`\n📊 Results: ${passed}/${results.length} tests passed`);

  process.exit(passed === results.length ? 0 : 1);
}

runTests();
```

**Run:**

```bash
node test/test-claude-code.js
```

---

## 9. Testing and Verification

### 9.1 Verification Checklist

- [ ] **Compilation**: `npm run build` without errors
- [ ] **OpenCode Models**: `curl http://localhost:7777/v1/models` returns 3 models (deepseek-multimodal-chat, deepseek-multimodal-reasoner, gemini-direct)
- [ ] **Claude Code Models**: `curl -H "anthropic-version: 2023-06-01" http://localhost:7777/v1/models` returns 3 Claude models
- [ ] **gemini-direct works**: Request to gemini-direct generates a response without calling DeepSeek
- [ ] **Haiku maps to gemini-direct**: Claude Code with Haiku uses "gemini-direct" strategy
- [ ] **Sonnet maps to deepseek-chat**: Claude Code with Sonnet processes multimedia correctly
- [ ] **Opus maps to reasoner**: Claude Code with Opus uses deepseek-multimodal-reasoner
- [ ] **Streaming works**: Claude Code with `--stream` receives correct Anthropic events
- [ ] **Heartbeats responded**: `POST /` returns 200 OK
- [ ] **Telemetry ignored**: `POST /api/event_logging/batch` returns 200 OK
- [ ] **OpenCode keeps working**: `curl -X POST http://localhost:7777/v1/chat/completions ...` unchanged

### 9.2 Expected Logs

**For Claude Code request (Haiku):**

```
POST /v1/messages | model: haiku | stream: false
🔄 Translating Anthropic → OpenAI request
Mapping: haiku → gemini-direct
🔮 gemini-direct model detected - Using Gemini for full response
✓ Anthropic request completed (1.2s total)
```

**For Claude Code request (Sonnet with image):**

```
POST /v1/messages | model: sonnet | stream: false
🔄 Translating Anthropic → OpenAI request
Mapping: sonnet → deepseek-multimodal-chat
📊 Content detected: 1 item(s)
  → 1. image (image/png): data:image/png;base64,...
🔍 Processing image 1/1 with Gemini...
✓ 1 item(s) processed in 0.8s (1 Gemini, 0 local)
✓ Processed content (gemini) - Routing to internal model
✓ Anthropic request completed (2.3s total)
```

### 9.3 Troubleshooting

**Problem: Claude Code won't connect**

```bash
# Verify proxy is listening
curl http://localhost:7777/health

# Verify models are available
curl -H "anthropic-version: 2023-06-01" http://localhost:7777/v1/models
```

**Problem: "Model not found" error**

- Check that model mapping in `anthropicAdapter.ts` includes the requested model
- Review logs to see what internal model is being used

**Problem: gemini-direct doesn't respond**

- Verify `GEMINI_API_KEY` is configured in `.env`
- Check `generateDirectResponse()` function in `geminiService.ts`
- Review logs: should show `🔮 gemini-direct model detected`

**Problem: Images are not processed**

- Verify that the sensory cortex is activated (log `📊 Content detected`)
- Verify that Gemini responds (log `🔍 Processing image...`)

---

## 10. Transformation Examples

### 10.1 Request: Anthropic → OpenAI

**Input (Anthropic):**

```json
{
  "model": "sonnet",
  "max_tokens": 1024,
  "system": "You are an expert technical assistant",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": "iVBORw0KGg..."
          }
        },
        {
          "type": "text",
          "text": "What do you see in this image?"
        }
      ]
    }
  ]
}
```

**Output (Internal OpenAI):**

```json
{
  "model": "deepseek-multimodal-chat",
  "messages": [
    {
      "role": "system",
      "content": "You are an expert technical assistant"
    },
    {
      "role": "user",
      "content": [
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,iVBORw0KGg..."
          }
        },
        {
          "type": "text",
          "text": "What do you see in this image?"
        }
      ]
    }
  ],
  "max_tokens": 1024
}
```

### 10.2 Response: OpenAI → Anthropic

**Input (DeepSeek response):**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1706745600,
  "model": "deepseek-chat",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "In the image I see a bright red pixel..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 20,
    "total_tokens": 70
  }
}
```

**Output (Anthropic):**

```json
{
  "id": "chatcmpl-abc123",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "In the image I see a bright red pixel..."
    }
  ],
  "model": "sonnet",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 50,
    "output_tokens": 20
  }
}
```

### 10.3 Streaming: OpenAI SSE → Anthropic SSE

**Input (OpenAI chunks):**

```
data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1706745600,"model":"deepseek-chat","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1706745600,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1706745600,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1706745600,"model":"deepseek-chat","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**Output (Anthropic events):**

```
event: message_start
data: {"type":"message_start","message":{"id":"chatcmpl-abc","type":"message","role":"assistant","model":"sonnet","usage":{"input_tokens":0,"output_tokens":0}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{},"usage":{"output_tokens":2}}

event: message_stop
data: {"type":"message_stop"}
```

---

## ✅ Final Summary

This guide implements **full Claude Code support** in the proxy without affecting OpenCode:

### New Components

- ✅ **`src/types/anthropic.ts`**: Anthropic Messages API types
- ✅ **`src/services/anthropicAdapter.ts`**: Bidirectional translator Anthropic ↔ OpenAI
- ✅ **`gemini-direct` Model**: DeepSeek bypass for Haiku

### Added Endpoints

- ✅ **`POST /v1/messages`**: Anthropic Messages API
- ✅ **`GET /v1/models` (dual detection)**: Claude models vs OpenAI models
- ✅ **`POST /`**: Heartbeats
- ✅ **`POST /api/event_logging/batch`**: Telemetry

### Modifications

- ✅ **`src/middleware/multimodalProcessor.ts`**: Support for gemini-direct
- ✅ **`src/services/geminiService.ts`**: `generateDirectResponse()` function
- ✅ **`src/index.ts`**: Anthropic handlers + client detection

### Compatibility

- ✅ **OpenCode**: Unchanged, keeps working normally
- ✅ **Claude Code**: Fully functional with 3 models
- ✅ **Sensory Cortex**: Shared by both clients
- ✅ **Cache**: Shared (same hash for same content)

### Claude Code Configuration

```bash
export ANTHROPIC_BASE_URL="http://localhost:7777/v1"
export ANTHROPIC_API_KEY="test"  # Any value
claude
```

**The proxy now works with both clients without additional configuration. 🎉**
