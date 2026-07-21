# Pluggable Brain and Vision Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the proxy into a provider-pluggable architecture selected at startup by `BRAIN_MODE` (`auto` | `opencode` | `deepseek` | `hybrid`) so the same binary serves the public OpenCode Go + MiMo V2.5 stack OR a personal DeepSeek + MiniMax M3 stack without source change. Behavior in `BRAIN_MODE=auto` with only `OPENCODE_GO_API_KEY` set must be byte-identical to v3.0.0.

**Architecture:** Two new TypeScript interfaces (`BrainProvider`, `VisionProvider`) with multiple implementations selected at module load by `providerSelector.ts`. The selector reads `BRAIN_MODE`, validates keys, builds the dynamic `BRAIN_MODELS` registry via a new `registerBrainEntry()` helper, and exports the active brain + vision providers. `multimodalProcessor` and `index.ts` are refactored to consume providers via their interfaces. Public path is preserved by identical wire behavior in the renamed `opencodeGoBrainProvider` + `mimoSensesVisionProvider` (wrappers of the existing services).

**Tech Stack:** TypeScript 5, Node.js >= 20.x, Vitest, ESLint, axios, OpenAI-compatible + Anthropic-compatible HTTP, OpenCode Go API (`https://opencode.ai/zen/go/v1`), DeepSeek API (`https://api.deepseek.com`), MiniMax API (`https://api.minimax.io/anthropic`).

## Global Constraints

- Node.js >= 20.x.
- Build must pass (`npm run build`).
- All unit tests must pass (`npm run test:unit`).
- Lint clean (`npm run lint`).
- Use exact string matches for model routing, not `includes`/prototype checks.
- Use `Object.hasOwn()` for registry checks (prototype safety).
- No new dependencies.
- Validate env vars at constructor (matching existing `opencodeGoService` throw on missing key).
- `BRAIN_MODE` defaults to `auto` when unset. `auto` resolves to `deepseek` if `DEEPSEEK_API_KEY` is present (with warning if `OPENCODE_GO_API_KEY` also present), else `opencode` if `OPENCODE_GO_API_KEY` is present, else fatal at startup.
- The renamed `opencodeGoBrainProvider` and `mimoSensesVisionProvider` must produce byte-identical wire behavior to the v3.0.0 services they replace (verified by existing tests passing unmodified on renamed fixtures).
- Pricing for `proxy/deepseek-v4-pro` updates from $1.74/$3.48 to $0.435/$0.87 (post-June 2026 cut).
- All four brains in `opencode`/`hybrid` mode keep `thinking: true`.
- All brains use the OpenAI-format endpoint except `proxy/qwen3.7-max` (Anthropic-format). `proxy/local-*` DeepSeek brains are OpenAI-format.
- Conventions from `CLAUDE.md`: English for code/commits/docs; neutral Spanish only for chat responses.

---

## File Structure

**New files (8):**
- `src/services/brainProvider.ts` — `BrainProvider` interface + `BrainModelEntry` interface (moved from `brainRegistry.ts`).
- `src/services/visionProvider.ts` — `VisionProvider` interface + `VisionContentType` union.
- `src/services/anthropicPayloadConverter.ts` — extracted `openAIToAnthropicPayload` function.
- `src/services/opencodeGoBrainProvider.ts` — `OpenCodeGoBrainProvider` class implementing `BrainProvider` (replaces `opencodeGoService.ts`).
- `src/services/mimoSensesVisionProvider.ts` — `MimoSensesVisionProvider` class implementing `VisionProvider` (replaces `mimoSensesService.ts`).
- `src/services/deepseekBrainProvider.ts` — `DeepSeekBrainProvider` class implementing `BrainProvider`.
- `src/services/minimaxM3VisionProvider.ts` — `MiniMaxM3VisionProvider` class implementing `VisionProvider`.
- `src/services/providerSelector.ts` — `BRAIN_MODE` resolver + factory + exports.

**New test files (5):**
- `tests/unit/services/anthropicPayloadConverter.test.ts`
- `tests/unit/services/deepseekBrainProvider.test.ts`
- `tests/unit/services/minimaxM3VisionProvider.test.ts`
- `tests/unit/services/opencodeGoBrainProvider.test.ts`
- `tests/unit/services/mimoSensesVisionProvider.test.ts`
- `tests/unit/services/providerSelector.test.ts`

**Deleted files (after migration):**
- `src/services/opencodeGoService.ts`
- `src/services/mimoSensesService.ts`
- `tests/unit/services/opencodeGoService.test.ts`
- `tests/unit/services/mimoSensesService.test.ts`

**Modified files (7):**
- `src/services/brainRegistry.ts` — `BRAIN_MODELS` → `BRAIN_MODELS_BASE`; add `registerBrainEntry`, `getBrainModels`, `parseLocalProxyModelId`; re-export `BrainModelEntry`.
- `src/middleware/multimodalProcessor.ts` — `processMultimodalContent` accepts optional `VisionProvider`; dispatch on `supportsContentType`; fallback to `geminiService` on error.
- `src/index.ts` — import from `providerSelector.ts`; expose `getActiveBrainProvider()`/`getActiveVisionProvider()`/`getBrainModels()` from `/v1/models` and `/health`.
- `.env.example` — document `BRAIN_MODE`, `DEEPSEEK_*`, `MINIMAX_*`.
- `README.md` — new "Modes" section, updated pricing, env table.
- `CLAUDE.md` — updated Models/Brain context window policy/Pricing; new Section for `BRAIN_MODE`).
- `MODELS.md` — updated Brain Models table with `proxy/local-*` rows + new pricing.
- `tests/unit/services/brainRegistry.test.ts` — registerBrainEntry/getBrainModels/parseLocalProxyModelId tests.
- `tests/unit/middleware/multimodalProcessor.test.ts` — mock `VisionProvider` tests.

**Unchanged files (everything else):**
`geminiService.ts`, `pdfProcessor.ts`, `messageTransforms.ts`, `anthropicStreamConverter.ts`, `anthropicAdapter.ts`, `opencode.json`, `types/openai.ts`, `types/anthropic.ts`, `utils/*`, `tests/unit/middleware/multimodalDetector.test.ts`, `tests/unit/utils/*`, `tests/unit/services/cacheService.test.ts`, `tests/unit/services/anthropicAdapter.test.ts`, Docker/CI configs.

---

## Task 1: Extract `openAIToAnthropicPayload` to `anthropicPayloadConverter.ts`

**Files:**
- Create: `src/services/anthropicPayloadConverter.ts`
- Create: `tests/unit/services/anthropicPayloadConverter.test.ts`
- Modify: `src/services/opencodeGoService.ts:25-118` (remove inline function; import instead)

**Consumes:** Nothing (pure extraction).

**Produces:** Standalone `openAIToAnthropicPayload` function in `anthropicPayloadConverter.ts`. All existing `opencodeGoService.test.ts` tests still pass after a one-line import change.

- [ ] **Step 1.1: Write the failing test**

Create `tests/unit/services/anthropicPayloadConverter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { openAIToAnthropicPayload } from "../../../src/services/anthropicPayloadConverter";
import type { ChatCompletionRequest } from "../../../src/types/openai";

describe("openAIToAnthropicPayload", () => {
  const baseRequest: ChatCompletionRequest = {
    model: "proxy/qwen3.7-max",
    messages: [{ role: "user", content: "hello" }],
  };

  it("moves system message to top-level system field", () => {
    const req: ChatCompletionRequest = {
      ...baseRequest,
      messages: [
        { role: "system", content: "you are a helpful assistant" },
        { role: "user", content: "hello" },
      ],
    };
    const out = openAIToAnthropicPayload(req, "qwen3.7-max", req.messages as any, false, false);
    expect(out.system).toBe("you are a helpful assistant");
    expect(out.messages).toHaveLength(1);
  });

  it("translates assistant tool_calls to tool_use blocks", () => {
    const req: ChatCompletionRequest = {
      ...baseRequest,
      messages: [
        { role: "user", content: "what is 2+2?" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "tc_1",
              type: "function",
              function: {
                name: "add",
                arguments: JSON.stringify({ a: 2, b: 2 }),
              },
            },
          ],
        },
      ],
    };
    const out = openAIToAnthropicPayload(
      req,
      "qwen3.7-max",
      req.messages as any,
      false,
      false,
    );
    const assistantMsg = out.messages[1];
    expect(assistantMsg.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool_use", id: "tc_1", name: "add" }),
      ]),
    );
  });

  it("translates tool role to Anthropic user tool_result block", () => {
    const req: ChatCompletionRequest = {
      ...baseRequest,
      messages: [
        { role: "user", content: "compute" },
        {
          role: "tool",
          tool_call_id: "tc_1",
          content: "4",
        },
      ],
    };
    const out = openAIToAnthropicPayload(
      req,
      "qwen3.7-max",
      req.messages as any,
      false,
      false,
    );
    expect(out.messages[1].role).toBe("user");
    expect(out.messages[1].content[0].type).toBe("tool_result");
    expect(out.messages[1].content[0].tool_use_id).toBe("tc_1");
  });

  it("adds thinking block with budget_tokens when thinking=true", () => {
    const out = openAIToAnthropicPayload(
      baseRequest,
      "qwen3.7-max",
      baseRequest.messages as any,
      false,
      true,
    );
    expect(out.thinking).toBeDefined();
    expect(out.thinking.type).toBe("enabled");
    expect(out.thinking.budget_tokens).toBeGreaterThanOrEqual(1024);
  });

  it("omits thinking block when thinking=false", () => {
    const out = openAIToAnthropicPayload(
      baseRequest,
      "qwen3.7-max",
      baseRequest.messages as any,
      false,
      false,
    );
    expect(out.thinking).toBeUndefined();
  });
});
```

- [ ] **Step 1.2: Run the failing test**

Run: `npm run test:unit -- anthropicPayloadConverter`
Expected: FAIL — `Cannot find module '../../../src/services/anthropicPayloadConverter'` (or similar module resolution error).

- [ ] **Step 1.3: Create the converter module**

Create `src/services/anthropicPayloadConverter.ts` with the function moved verbatim from `src/services/opencodeGoService.ts:26-119` (the function body stays identical, including the `function openAIToAnthropicPayload` signature with 5 parameters: `request`, `upstreamModel`, `validMessages`, `stream`, `thinking`).

```ts
export function openAIToAnthropicPayload(
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
```

Add the import line at the top:
```ts
import type { ChatCompletionRequest } from "../types/openai";
```

- [ ] **Step 1.4: Run the test to verify it passes**

Run: `npm run test:unit -- anthropicPayloadConverter`
Expected: PASS — 5 tests.

- [ ] **Step 1.5: Wire the new module into `opencodeGoService.ts`**

In `src/services/opencodeGoService.ts`, **delete** the inline `function openAIToAnthropicPayload(...)` definition (lines 26-119). Add at the top imports block:

```ts
import { openAIToAnthropicPayload } from "./anthropicPayloadConverter";
```

The call site at the bottom (around line 190) keeps its current usage: `openAIToAnthropicPayload(request, upstreamModel, truncatedMessages, request.stream || false, thinking)`.

- [ ] **Step 1.6: Run all unit tests to confirm no regression**

Run: `npm run test:unit`
Expected: PASS — same test count as before, all existing `opencodeGoService.test.ts` tests pass.

- [ ] **Step 1.7: Run lint and build**

Run: `npm run lint && npm run build`
Expected: PASS — no errors.

- [ ] **Step 1.8: Commit**

```bash
git add src/services/anthropicPayloadConverter.ts \
        src/services/opencodeGoService.ts \
        tests/unit/services/anthropicPayloadConverter.test.ts
git commit -m "refactor(services): extract openAIToAnthropicPayload to shared converter"
```

---

## Task 2: Define `BrainProvider` and `VisionProvider` interfaces

**Files:**
- Create: `src/services/brainProvider.ts`
- Create: `src/services/visionProvider.ts`
- Modify: `src/services/brainRegistry.ts` (move `BrainModelEntry` interface, re-export from both files)

**Consumes:** Nothing.

**Produces:** Two new interface modules. `BrainModelEntry` declared in `brainProvider.ts`; re-exported from `brainRegistry.ts`. Existing tests that import `BrainModelEntry` from `brainRegistry` keep working.

- [ ] **Step 2.1: Create `src/services/brainProvider.ts`**

```ts
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
```

- [ ] **Step 2.2: Create `src/services/visionProvider.ts`**

```ts
export type VisionContentType = "image" | "video" | "audio";

export interface VisionProvider {
  readonly name: string;
  isAvailable(): boolean;
  supportsContentType(type: VisionContentType): boolean;
  describeImage(imageUrl: string, userContext: string): Promise<string>;
}
```

- [ ] **Step 2.3: Update `src/services/brainRegistry.ts` to host the interface in the new canonical location**

In `src/services/brainRegistry.ts`, **delete** the existing `BrainModelEntry` interface block at lines 1-10. Add at the top:

```ts
import type { BrainModelEntry } from "./brainProvider";

export type { BrainModelEntry } from "./brainProvider";
```

Update the remaining code in `brainRegistry.ts` that references `BrainModelEntry` (lines that still type the `BRAIN_MODELS` and `getBrainEntry` signature) — TypeScript will resolve via the import. No other changes.

- [ ] **Step 2.4: Run lint, build, tests**

Run: `npm run lint && npm run build && npm run test:unit`
Expected: PASS. `BrainModelEntry` import paths from both `brainProvider` and `brainRegistry` resolve.

- [ ] **Step 2.5: Commit**

```bash
git add src/services/brainProvider.ts \
        src/services/visionProvider.ts \
        src/services/brainRegistry.ts
git commit -m "feat(services): define BrainProvider and VisionProvider interfaces"
```

---

## Task 3: Rename `opencodeGoService.ts` → `opencodeGoBrainProvider.ts` (wrap as `BrainProvider`)

**Files:**
- Create: `src/services/opencodeGoBrainProvider.ts` (full content; class renamed + implements interface)
- Create: `tests/unit/services/opencodeGoBrainProvider.test.ts`
- Delete: `src/services/opencodeGoService.ts`
- Delete: `tests/unit/services/opencodeGoService.test.ts`
- Modify: any importer of `opencodeGoService` (none in source yet; this task is self-contained until Task 10 wires `index.ts`)

**Consumes:** `anthropicPayloadConverter` from Task 1; `BrainProvider` interface from Task 2.

**Produces:** `OpenCodeGoBrainProvider` class implementing `BrainProvider`. All existing tests (renamed) pass without behavior change.

- [ ] **Step 3.1: Create the renamed brain provider module**

Create `src/services/opencodeGoBrainProvider.ts` with the following complete content (the previous `opencodeGoService.ts:1-435` body, with the class renamed and an `implements BrainProvider` clause):

```ts
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

if (!OPENCODE_GO_API_KEY) {
  throw new Error("OPENCODE_GO_API_KEY no configurado en .env");
}

class OpenCodeGoBrainProvider implements BrainProvider {
  readonly name = "opencode-go";
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

export const opencodeGoBrainProvider = new OpenCodeGoBrainProvider();
```

- [ ] **Step 3.2: Create the renamed test file**

Create `tests/unit/services/opencodeGoBrainProvider.test.ts` with the FULL content of `tests/unit/services/opencodeGoService.test.ts` (982 lines) with one change: every `opencodeGoService` reference becomes `opencodeGoBrainProvider`, and every `from "../../../src/services/opencodeGoService"` becomes `from "../../../src/services/opencodeGoBrainProvider"`. Also update `describe("OpenCodeGoService", ...)` → `describe("OpenCodeGoBrainProvider", ...)`. Use `mv` in bash then update in place:

```bash
git mv tests/unit/services/opencodeGoService.test.ts tests/unit/services/opencodeGoBrainProvider.test.ts
git mv src/services/opencodeGoService.ts src/services/opencodeGoBrainProvider.ts
```

(The plan's Step 3.1 already creates the new file; this command creates the rename baseline. Adjust: if Step 3.1's `Write` succeeded, do NOT run `git mv src/...`; instead use `git rm src/services/opencodeGoService.ts` after the new file is committed. For the test file: `git mv tests/unit/services/opencodeGoService.test.ts tests/unit/services/opencodeGoBrainProvider.test.ts`, then edit `tests/unit/services/opencodeGoBrainProvider.test.ts` to swap `opencodeGoService` → `opencodeGoBrainProvider` everywhere.)

In `tests/unit/services/opencodeGoBrainProvider.test.ts` find these lines (4 occurrences of `opencodeGoService` in the original at lines 22, 32, 57, plus the `describe` block at line 12). Apply this `replaceAll` swap on the file (use the Edit tool's `replaceAll` flag):

- Old: `opencodeGoService` → New: `opencodeGoBrainProvider`
- Old: `src/services/opencodeGoService` → New: `src/services/opencodeGoBrainProvider`
- Old: `describe("OpenCodeGoService"` → New: `describe("OpenCodeGoBrainProvider"`

(Verify after the swap that 0 occurrences of `opencodeGoService` remain.)

- [ ] **Step 3.3: Delete the old service file**

After Step 3.1 verified the renamed file behaves identically and the test file rename is complete, delete the old source file:

```bash
git rm src/services/opencodeGoService.ts
```

(The file is no longer imported by anything in `src/`; Task 10 will update `src/index.ts` later.)

- [ ] **Step 3.4: Run lint, build, tests**

Run: `npm run lint && npm run build && npm run test:unit`
Expected: PASS — all tests pass with same count as before, file renamed.

- [ ] **Step 3.5: Commit**

```bash
git add -A src/services/opencodeGoBrainProvider.ts \
         tests/unit/services/opencodeGoBrainProvider.test.ts \
         src/services/opencodeGoService.ts
git commit -m "refactor(services): rename opencodeGoService to opencodeGoBrainProvider (BrainProvider)"
```

---

## Task 4: Rename `mimoSensesService.ts` → `mimoSensesVisionProvider.ts` (implement `VisionProvider`)

**Files:**
- Create: `src/services/mimoSensesVisionProvider.ts` (full content with new class + interface)
- Create: `tests/unit/services/mimoSensesVisionProvider.test.ts`
- Delete: `src/services/mimoSensesService.ts`
- Delete: `tests/unit/services/mimoSensesService.test.ts`

**Consumes:** `VisionProvider` interface from Task 2.

**Produces:** `MimoSensesVisionProvider` class implementing `VisionProvider`. All existing tests (renamed) pass; new tests verify `supportsContentType` (image=true, video=false, audio=false).

- [ ] **Step 4.1: Create the renamed vision provider module**

Create `src/services/mimoSensesVisionProvider.ts`:

```ts
import axios from "axios";
import { logger } from "../utils/logger";
import type {
  VisionProvider,
  VisionContentType,
} from "./visionProvider";

const SENSES_MODEL = process.env.SENSES_MODEL || "mimo-v2.5";
const OPENCODE_GO_BASE_URL =
  process.env.OPENCODE_GO_BASE_URL || "https://opencode.ai/zen/go/v1";
const OPENCODE_GO_API_KEY = process.env.OPENCODE_GO_API_KEY || "";
const SENSES_TIMEOUT_MS = parseInt(process.env.SENSES_TIMEOUT_MS || "120000");

const IMAGE_PROMPT =
  process.env.SENSES_IMAGE_PROMPT ||
  `Describe esta imagen con precisión técnica para que un programador ciego pueda recrearla.
INSTRUCCIONES ESPECÍFICAS:
1. Si es una INTERFAZ DE USUARIO: Describe layout, elementos, botones, colores, texto visible, jerarquía visual.
2. Si es un DIAGRAMA DE ARQUITECTURA: Describe componentes, conexiones, flujo de datos, relaciones.
3. Si es una CAPTURA DE ERROR: Describe mensajes de error, stack traces, contexto visual.
4. Si contiene TEXTO: Transcribe TODO el texto visible preservando estructura.
5. Sé LITERAL y PRECISO: No interpretes, solo describe.`;

class MimoSensesVisionProvider implements VisionProvider {
  readonly name = "mimo-v2.5-senses";
  private readonly supportedTypes = new Set<VisionContentType>(["image"]);

  isAvailable(): boolean {
    return !!OPENCODE_GO_API_KEY;
  }

  supportsContentType(type: VisionContentType): boolean {
    return this.supportedTypes.has(type);
  }

  async describeImage(
    imageUrl: string,
    userContext: string = "",
  ): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error("OPENCODE_GO_API_KEY no configurado en .env");
    }

    const prompt = userContext
      ? `${IMAGE_PROMPT}\n\nContexto del usuario: ${userContext}`
      : IMAGE_PROMPT;

    const imagePart = {
      type: "image_url" as const,
      image_url: { url: imageUrl },
    };

    const payload = {
      model: SENSES_MODEL,
      messages: [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: prompt },
            imagePart,
          ],
        },
      ],
      stream: false,
    };

    logger.info(
      `MiMo Senses: Describiendo imagen con ${SENSES_MODEL}...`,
    );

    const response = await axios.post(
      `${OPENCODE_GO_BASE_URL}/chat/completions`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${OPENCODE_GO_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: SENSES_TIMEOUT_MS,
      },
    );

    const content = response.data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("MiMo Senses: Respuesta vacía del modelo");
    }

    const usage = response.data.usage;
    if (usage) {
      logger.info(
        `MiMo Senses: ${usage.total_tokens} tokens (${usage.prompt_tokens} in, ${usage.completion_tokens} out)`,
      );
    }

    return content;
  }
}

export const mimoSensesVisionProvider = new MimoSensesVisionProvider();
```

- [ ] **Step 4.2: Rename the test file via git mv**

```bash
git mv tests/unit/services/mimoSensesService.test.ts tests/unit/services/mimoSensesVisionProvider.test.ts
```

- [ ] **Step 4.3: Swap references in the renamed test file**

In `tests/unit/services/mimoSensesVisionProvider.test.ts`, apply these `replaceAll` swaps:
- `mimoSensesService` → `mimoSensesVisionProvider`
- `src/services/mimoSensesService` → `src/services/mimoSensesVisionProvider`
- `describe("MiMoSensesService"` → `describe("MiMoSensesVisionProvider"`

Verify: 0 occurrences of `mimoSensesService` remain.

- [ ] **Step 4.4: Add `supportsContentType` tests**

Append at the end of `tests/unit/services/mimoSensesVisionProvider.test.ts`:

```ts
import { mimoSensesVisionProvider } from "../../../src/services/mimoSensesVisionProvider";

describe("MimoSensesVisionProvider.supportsContentType", () => {
  it("returns true for image", () => {
    expect(mimoSensesVisionProvider.supportsContentType("image")).toBe(true);
  });
  it("returns false for video", () => {
    expect(mimoSensesVisionProvider.supportsContentType("video")).toBe(false);
  });
  it("returns false for audio", () => {
    expect(mimoSensesVisionProvider.supportsContentType("audio")).toBe(false);
  });
});
```

- [ ] **Step 4.5: Delete the old service file**

```bash
git rm src/services/mimoSensesService.ts
```

- [ ] **Step 4.6: Run lint, build, tests**

Run: `npm run lint && npm run build && npm run test:unit`
Expected: PASS — existing tests + 3 new `supportsContentType` tests all green.

- [ ] **Step 4.7: Commit**

```bash
git add -A src/services/mimoSensesVisionProvider.ts \
         src/services/mimoSensesService.ts \
         tests/unit/services/mimoSensesVisionProvider.test.ts
git commit -m "refactor(services): rename mimoSensesService to mimoSensesVisionProvider (VisionProvider)"
```

---

## Task 5: Implement `DeepSeekBrainProvider`

**Files:**
- Create: `src/services/deepseekBrainProvider.ts`
- Create: `tests/unit/services/deepseekBrainProvider.test.ts`

**Consumes:** `BrainProvider` interface from Task 2.

**Produces:** `DeepSeekBrainProvider` class. `name = "deepseek-direct"`. POSTs to `${DEEPSEEK_BASE_URL}/chat/completions` (default `https://api.deepseek.com`) with Bearer auth. Retries with same curve as `OpenCodeGoBrainProvider`.

- [ ] **Step 5.1: Write the failing tests**

Create `tests/unit/services/deepseekBrainProvider.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios");
vi.mock("dotenv/config", () => ({}));

const mockedAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
};

const openaiBrainEntry = {
  upstream: "deepseek-v4-pro",
  context: 1_048_576,
  maxOutput: 384_000,
  thinking: true,
  inputPrice: 0.435,
  outputPrice: 0.87,
  endpoint: "openai" as const,
  multimodal: false,
};

describe("DeepSeekBrainProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    mockedAxios.post = vi.fn();
  });

  it("throws at constructor if DEEPSEEK_API_KEY is missing", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("DEEPSEEK_BASE_URL", "");
    await expect(async () => {
      await import("../../../src/services/deepseekBrainProvider");
    }).rejects.toThrow("DEEPSEEK_API_KEY");
    vi.unstubAllEnvs();
  });

  it("buildPayload sets thinking block when entry.thinking=true", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
    const { deepseekBrainProvider } = await import(
      "../../../src/services/deepseekBrainProvider"
    );
    const payload = deepseekBrainProvider.buildPayload(
      { model: "x", messages: [{ role: "user" as const, content: "hi" }] },
      "deepseek-v4-pro",
      true,
      1_048_576,
      "openai",
    );
    expect(payload.model).toBe("deepseek-v4-pro");
    expect(payload.thinking).toEqual({ type: "enabled" });
  });

  it("buildPayload omits thinking when entry.thinking=false", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
    const { deepseekBrainProvider } = await import(
      "../../../src/services/deepseekBrainProvider"
    );
    const payload = deepseekBrainProvider.buildPayload(
      { model: "x", messages: [{ role: "user" as const, content: "hi" }] },
      "deepseek-v4-pro",
      false,
      1_048_576,
      "openai",
    );
    expect(payload.thinking).toBeUndefined();
  });

  it("createChatCompletion POSTs to DEEPSEEK_BASE_URL/chat/completions with Bearer auth", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com");
    mockedAxios.post.mockResolvedValue({ data: { choices: [] } });
    const { deepseekBrainProvider } = await import(
      "../../../src/services/deepseekBrainProvider"
    );
    await deepseekBrainProvider.createChatCompletion(
      { model: "proxy/deepseek-v4-pro", messages: [{ role: "user" as const, content: "hi" }] },
      openaiBrainEntry,
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({ model: "deepseek-v4-pro", thinking: { type: "enabled" } }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-deepseek",
        }),
        timeout: expect.any(Number),
      }),
    );
  });

  it("retries on 503 and succeeds on second attempt", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
    mockedAxios.post
      .mockRejectedValueOnce({ response: { status: 503, headers: {} }, isAxiosError: true })
      .mockResolvedValueOnce({ data: { choices: [] } });
    const { deepseekBrainProvider } = await import(
      "../../../src/services/deepseekBrainProvider"
    );
    const resp = await deepseekBrainProvider.createChatCompletion(
      { model: "x", messages: [{ role: "user" as const, content: "hi" }] },
      openaiBrainEntry,
    );
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(resp).toEqual({ choices: [] });
  });

  it("throws on non-retryable 400", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
    mockedAxios.post.mockRejectedValue({
      response: { status: 400, headers: {} },
      isAxiosError: true,
    });
    const { deepseekBrainProvider } = await import(
      "../../../src/services/deepseekBrainProvider"
    );
    await expect(
      deepseekBrainProvider.createChatCompletion(
        { model: "x", messages: [{ role: "user" as const, content: "hi" }] },
        openaiBrainEntry,
      ),
    ).rejects.toBeDefined();
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it("name is 'deepseek-direct'", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
    const { deepseekBrainProvider } = await import(
      "../../../src/services/deepseekBrainProvider"
    );
    expect(deepseekBrainProvider.name).toBe("deepseek-direct");
  });
});
```

- [ ] **Step 5.2: Run the failing tests**

Run: `npm run test:unit -- deepseekBrainProvider`
Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement `DeepSeekBrainProvider`**

Create `src/services/deepseekBrainProvider.ts`:

```ts
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

if (!DEEPSEEK_API_KEY) {
  throw new Error("DEEPSEEK_API_KEY no configurado en .env");
}

class DeepSeekBrainProvider implements BrainProvider {
  readonly name = "deepseek-direct";
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.apiKey = DEEPSEEK_API_KEY;
    this.baseUrl = DEEPSEEK_BASE_URL;
    this.timeout = DEEPSEEK_TIMEOUT_MS;
  }

  resolveEndpointUrl(endpoint: "openai" | "anthropic"): string {
    if (endpoint === "anthropic") {
      return `${this.baseUrl}/anthropic/v1/messages`;
    }
    return `${this.baseUrl}/v1/chat/completions`;
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

export const deepseekBrainProvider = new DeepSeekBrainProvider();
```

- [ ] **Step 5.4: Run the tests to verify they pass**

Run: `npm run test:unit -- deepseekBrainProvider`
Expected: PASS — all 7 tests.

- [ ] **Step 5.5: Run lint and build**

Run: `npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5.6: Commit**

```bash
git add src/services/deepseekBrainProvider.ts tests/unit/services/deepseekBrainProvider.test.ts
git commit -m "feat(services): add DeepSeekBrainProvider (OpenAI-compatible, OpenCode-style retries)"
```

---

## Task 6: Implement `MiniMaxM3VisionProvider`

**Files:**
- Create: `src/services/minimaxM3VisionProvider.ts`
- Create: `tests/unit/services/minimaxM3VisionProvider.test.ts`

**Consumes:** `VisionProvider` interface from Task 2.

**Produces:** `MiniMaxM3VisionProvider` class. `name = "minimax-m3"`. POSTs to `${MINIMAX_BASE_URL}/v1/messages` (default `https://api.minimax.io/anthropic/v1/messages`) with Anthropic-format headers + payload, **no `thinking` block**. `supportsContentType`: image=true, video=true, audio=false.

- [ ] **Step 6.1: Write the failing tests**

Create `tests/unit/services/minimaxM3VisionProvider.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios");
vi.mock("dotenv/config", () => ({}));

const mockedAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
};

describe("MiniMaxM3VisionProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: {
        content: [{ type: "text", text: "A diagram of the system" }],
        usage: { input_tokens: 100, output_tokens: 20 },
      },
    });
  });

  it("throws at constructor if MINIMAX_API_KEY is missing", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "");
    vi.stubEnv("MINIMAX_BASE_URL", "");
    await expect(async () => {
      await import("../../../src/services/minimaxM3VisionProvider");
    }).rejects.toThrow("MINIMAX_API_KEY");
    vi.unstubAllEnvs();
  });

  it("describeImage POSTs to MINIMAX_BASE_URL/v1/messages with anthropic headers", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    vi.stubEnv("SENSES_MODEL", "MiniMax-M3");
    const { minimaxM3VisionProvider } = await import(
      "../../../src/services/minimaxM3VisionProvider"
    );
    await minimaxM3VisionProvider.describeImage("https://example.com/img.png", "context");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://api.minimax.io/anthropic/v1/messages",
      expect.objectContaining({
        model: "MiniMax-M3",
        messages: [
          {
            role: "user",
            content: expect.arrayContaining([
              expect.objectContaining({ type: "text" }),
              expect.objectContaining({
                type: "image",
                source: { type: "url", url: "https://example.com/img.png" },
              }),
            ]),
          },
        ],
        max_tokens: expect.any(Number),
        stream: false,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "sk-test-minimax",
          "anthropic-version": "2023-06-01",
        }),
      }),
    );
  });

  it("does NOT include a thinking block in the payload", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    const { minimaxM3VisionProvider } = await import(
      "../../../src/services/minimaxM3VisionProvider"
    );
    await minimaxM3VisionProvider.describeImage("https://example.com/img.png");
    const callArgs = mockedAxios.post.mock.calls[0];
    const body = callArgs[1];
    expect(body.thinking).toBeUndefined();
  });

  it("returns the text content from the first text block", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    const { minimaxM3VisionProvider } = await import(
      "../../../src/services/minimaxM3VisionProvider"
    );
    const out = await minimaxM3VisionProvider.describeImage("https://example.com/img.png");
    expect(out).toBe("A diagram of the system");
  });

  it("throws on empty response content", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    mockedAxios.post.mockResolvedValueOnce({
      data: { content: [{ type: "tool_use" }] },
    });
    const { minimaxM3VisionProvider } = await import(
      "../../../src/services/minimaxM3VisionProvider"
    );
    await expect(
      minimaxM3VisionProvider.describeImage("https://example.com/img.png"),
    ).rejects.toThrow("MiniMax M3");
  });

  describe("supportsContentType", () => {
    it("returns true for image", async () => {
      vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
      const { minimaxM3VisionProvider } = await import(
        "../../../src/services/minimaxM3VisionProvider"
      );
      expect(minimaxM3VisionProvider.supportsContentType("image")).toBe(true);
    });
    it("returns true for video", async () => {
      vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
      const { minimaxM3VisionProvider } = await import(
        "../../../src/services/minimaxM3VisionProvider"
      );
      expect(minimaxM3VisionProvider.supportsContentType("video")).toBe(true);
    });
    it("returns false for audio", async () => {
      vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
      const { minimaxM3VisionProvider } = await import(
        "../../../src/services/minimaxM3VisionProvider"
      );
      expect(minimaxM3VisionProvider.supportsContentType("audio")).toBe(false);
    });
    it("name is 'minimax-m3'", async () => {
      vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
      const { minimaxM3VisionProvider } = await import(
        "../../../src/services/minimaxM3VisionProvider"
      );
      expect(minimaxM3VisionProvider.name).toBe("minimax-m3");
    });
  });
});
```

- [ ] **Step 6.2: Run the failing tests**

Run: `npm run test:unit -- minimaxM3VisionProvider`
Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement `MiniMaxM3VisionProvider`**

Create `src/services/minimaxM3VisionProvider.ts`:

```ts
import axios from "axios";
import { logger } from "../utils/logger";
import type {
  VisionContentType,
  VisionProvider,
} from "./visionProvider";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "";
const MINIMAX_BASE_URL =
  process.env.MINIMAX_BASE_URL || "https://api.minimax.io/anthropic";
const SENSES_MODEL = process.env.SENSES_MODEL || "MiniMax-M3";
const SENSES_TIMEOUT_MS = parseInt(process.env.SENSES_TIMEOUT_MS || "120000");

if (!MINIMAX_API_KEY) {
  throw new Error("MINIMAX_API_KEY no configurado en .env");
}

const IMAGE_PROMPT =
  process.env.SENSES_IMAGE_PROMPT ||
  `Describe esta imagen con precisión técnica para que un programador ciego pueda recrearla.
INSTRUCCIONES ESPECÍFICAS:
1. Si es una INTERFAZ DE USUARIO: Describe layout, elementos, botones, colores, texto visible, jerarquía visual.
2. Si es un DIAGRAMA DE ARQUITECTURA: Describe componentes, conexiones, flujo de datos, relaciones.
3. Si es una CAPTURA DE ERROR: Describe mensajes de error, stack traces, contexto visual.
4. Si contiene TEXTO: Transcribe TODO el texto visible preservando estructura.
5. Sé LITERAL y PRECISO: No interpretes, solo describe.`;

class MiniMaxM3VisionProvider implements VisionProvider {
  readonly name = "minimax-m3";
  private readonly supportedTypes = new Set<VisionContentType>(["image", "video"]);

  isAvailable(): boolean {
    return !!MINIMAX_API_KEY;
  }

  supportsContentType(type: VisionContentType): boolean {
    return this.supportedTypes.has(type);
  }

  async describeImage(
    imageUrl: string,
    userContext: string = "",
  ): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error("MINIMAX_API_KEY no configurado en .env");
    }

    const prompt = userContext
      ? `${IMAGE_PROMPT}\n\nContexto del usuario: ${userContext}`
      : IMAGE_PROMPT;

    const payload = {
      model: SENSES_MODEL,
      messages: [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: prompt },
            {
              type: "image" as const,
              source: { type: "url" as const, url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 4096,
      stream: false,
    };

    logger.info(
      `MiniMax M3: Describiendo imagen con ${SENSES_MODEL}...`,
    );

    let lastError: unknown;
    const maxRetries = 3;
    const baseDelay = 2000;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${MINIMAX_BASE_URL}/v1/messages`,
          payload,
          {
            headers: {
              "x-api-key": MINIMAX_API_KEY,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
              Authorization: `Bearer ${MINIMAX_API_KEY}`,
            },
            timeout: SENSES_TIMEOUT_MS,
          },
        );

        const blocks = response.data.content;
        if (!Array.isArray(blocks)) {
          throw new Error("MiniMax M3: respuesta sin bloque content");
        }
        const text = blocks
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("\n");
        if (!text) {
          throw new Error("MiniMax M3: respuesta vacía");
        }
        const usage = response.data.usage;
        if (usage) {
          logger.info(
            `MiniMax M3: in=${usage.input_tokens} out=${usage.output_tokens}`,
          );
        }
        return text;
      } catch (error: unknown) {
        lastError = error;
        const status = axios.isAxiosError(error) ? error.response?.status : 0;
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
}

export const minimaxM3VisionProvider = new MiniMaxM3VisionProvider();
```

- [ ] **Step 6.4: Run the tests**

Run: `npm run test:unit -- minimaxM3VisionProvider`
Expected: PASS — all tests.

- [ ] **Step 6.5: Run lint and build**

Run: `npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 6.6: Commit**

```bash
git add src/services/minimaxM3VisionProvider.ts tests/unit/services/minimaxM3VisionProvider.test.ts
git commit -m "feat(services): add MiniMaxM3VisionProvider (Anthropic-format, no thinking)"
```

---

## Task 7: Extend `brainRegistry` with runtime registration + hybrid parsing

**Files:**
- Modify: `src/services/brainRegistry.ts`
- Modify: `tests/unit/services/brainRegistry.test.ts`

**Consumes:** `BrainModelEntry` from Task 2.

**Produces:**
- `BRAIN_MODELS_BASE` (renamed from `BRAIN_MODELS`, with adjusted V4 Pro pricing $0.435/$0.87).
- `registerBrainEntry(id, entry)` — adds entries to runtime registry.
- `getBrainModels()` — returns merged view (base + runtime).
- `parseLocalProxyModelId(id)` — strips `proxy/local-` prefix for `proxy/local-deepseek-v4-{pro,flash}` style IDs.
- `resetBrainRegistry()` — test helper; clears runtime registrations.
- All existing lookup helpers (`getBrainEntry`, `isPassthrough`, `parseProxyModelId`, `isKnownModel`) continue to work via the merged view.

- [ ] **Step 7.1: Write failing tests**

Append to `tests/unit/services/brainRegistry.test.ts`:

```ts
describe("BrainRegistry runtime registration", () => {
  beforeEach(async () => {
    const { resetBrainRegistry } = await import(
      "../../../src/services/brainRegistry"
    );
    resetBrainRegistry();
  });

  it("registerBrainEntry adds an entry visible via getBrainModels and getBrainEntry", async () => {
    const { registerBrainEntry, getBrainModels, getBrainEntry } =
      await import("../../../src/services/brainRegistry");
    registerBrainEntry("proxy/local-test", {
      upstream: "deepseek-v4-pro",
      context: 1_048_576,
      maxOutput: 384_000,
      thinking: true,
      inputPrice: 0.435,
      outputPrice: 0.87,
      endpoint: "openai",
      multimodal: false,
    });
    expect(getBrainModels()["proxy/local-test"]).toBeDefined();
    expect(getBrainEntry("proxy/local-test")?.upstream).toBe("deepseek-v4-pro");
  });

  it("parseLocalProxyModelId strips 'proxy/local-' prefix", async () => {
    const { parseLocalProxyModelId } = await import(
      "../../../src/services/brainRegistry"
    );
    expect(parseLocalProxyModelId("proxy/local-deepseek-v4-pro")).toBe(
      "deepseek-v4-pro",
    );
    expect(parseLocalProxyModelId("proxy/local-deepseek-v4-flash")).toBe(
      "deepseek-v4-flash",
    );
    expect(parseLocalProxyModelId("proxy/deepseek-v4-pro")).toBeNull();
    expect(parseLocalProxyModelId("not-a-proxy-id")).toBeNull();
  });

  it("isKnownModel sees registered entries", async () => {
    const { registerBrainEntry, isKnownModel } = await import(
      "../../../src/services/brainRegistry"
    );
    registerBrainEntry("proxy/local-test", {
      upstream: "deepseek-v4-pro",
      context: 1_048_576,
      maxOutput: 384_000,
      thinking: true,
      inputPrice: 0.435,
      outputPrice: 0.87,
      endpoint: "openai",
      multimodal: false,
    });
    expect(isKnownModel("proxy/local-test")).toBe(true);
  });
});
```

- [ ] **Step 7.2: Run the failing tests**

Run: `npm run test:unit -- brainRegistry`
Expected: FAIL — `resetBrainRegistry`/`registerBrainEntry`/`getBrainModels`/`parseLocalProxyModelId` not exported.

- [ ] **Step 7.3: Update `src/services/brainRegistry.ts`**

Replace the entire content with:

```ts
import type { BrainModelEntry } from "./brainProvider";

export type { BrainModelEntry } from "./brainProvider";

export const BRAIN_MODELS_BASE: Record<string, BrainModelEntry> = {
  "proxy/glm-5.2": {
    upstream: "glm-5.2",
    context: 1_048_576,
    maxOutput: 131072,
    thinking: true,
    inputPrice: 1.4,
    outputPrice: 4.4,
    endpoint: "openai",
    multimodal: false,
  },
  "proxy/deepseek-v4-pro": {
    upstream: "deepseek-v4-pro",
    context: 1_048_576,
    maxOutput: 384000,
    thinking: true,
    inputPrice: 0.435,
    outputPrice: 0.87,
    endpoint: "openai",
    multimodal: false,
  },
  "proxy/qwen3.7-max": {
    upstream: "qwen3.7-max",
    context: 1_048_576,
    maxOutput: 65_536,
    thinking: true,
    inputPrice: 2.5,
    outputPrice: 7.5,
    endpoint: "anthropic",
    multimodal: false,
  },
  "proxy/mimo-v2.5-pro": {
    upstream: "mimo-v2.5-pro",
    context: 1_048_576,
    maxOutput: 65_536,
    thinking: true,
    inputPrice: 1.74,
    outputPrice: 3.48,
    endpoint: "openai",
    multimodal: false,
  },
};

export const PASSTHROUGH_MODELS = new Set([
  "mimo-v2.5",
]);

const PROXY_PREFIX = "proxy/";
const LOCAL_PROXY_PREFIX = "proxy/local-";

const BRAIN_MODELS_RUNTIME = new Map<string, BrainModelEntry>();

export function registerBrainEntry(id: string, entry: BrainModelEntry): void {
  BRAIN_MODELS_RUNTIME.set(id, entry);
}

export function resetBrainRegistry(): void {
  BRAIN_MODELS_RUNTIME.clear();
}

export function getBrainModels(): Record<string, BrainModelEntry> {
  const merged: Record<string, BrainModelEntry> = { ...BRAIN_MODELS_BASE };
  for (const [id, entry] of BRAIN_MODELS_RUNTIME) {
    merged[id] = entry;
  }
  return merged;
}

export function getBrainEntry(modelId: string): BrainModelEntry | undefined {
  const models = getBrainModels();
  return Object.hasOwn(models, modelId) ? models[modelId] : undefined;
}

export function isPassthrough(modelId: string): boolean {
  return PASSTHROUGH_MODELS.has(modelId);
}

export function parseProxyModelId(modelId: string): string | null {
  if (!modelId.startsWith(PROXY_PREFIX)) return null;
  const upstream = modelId.slice(PROXY_PREFIX.length);
  return upstream || null;
}

export function parseLocalProxyModelId(modelId: string): string | null {
  if (!modelId.startsWith(LOCAL_PROXY_PREFIX)) return null;
  const upstream = modelId.slice(LOCAL_PROXY_PREFIX.length);
  return upstream || null;
}

export function isKnownModel(modelId: string): boolean {
  const models = getBrainModels();
  return Object.hasOwn(models, modelId) || PASSTHROUGH_MODELS.has(modelId);
}
```

- [ ] **Step 7.4: Update existing tests that reference `BRAIN_MODELS`**

In `tests/unit/services/brainRegistry.test.ts`, change `BRAIN_MODELS` → `BRAIN_MODELS_BASE` (replaceAll). If any test counts entries (e.g. `Object.keys(BRAIN_MODELS)` → length 4), the count is still 4 from base; verify the existing assertions hold against `BRAIN_MODELS_BASE`.

Add at the top of `tests/unit/services/brainRegistry.test.ts`, after the `import` lines:

```ts
import {
  BRAIN_MODELS_BASE,
  resetBrainRegistry,
} from "../../../src/services/brainRegistry";

beforeEach(() => {
  resetBrainRegistry();
});
```

- [ ] **Step 7.5: Run lint, build, tests**

Run: `npm run lint && npm run build && npm run test:unit`
Expected: PASS — all old brainRegistry tests pass against `BRAIN_MODELS_BASE`; new registration tests pass.

- [ ] **Step 7.6: Commit**

```bash
git add src/services/brainRegistry.ts tests/unit/services/brainRegistry.test.ts
git commit -m "feat(services): runtime brain registry with registerBrainEntry and parseLocalProxyModelId"
```

---

## Task 8: Implement `providerSelector.ts`

**Files:**
- Create: `src/services/providerSelector.ts`
- Create: `tests/unit/services/providerSelector.test.ts`

**Consumes:** `OpenCodeGoBrainProvider` (Task 3), `DeepSeekBrainProvider` (Task 5), `MimoSensesVisionProvider` (Task 4), `MiniMaxM3VisionProvider` (Task 6), `registerBrainEntry`/`getBrainModels` (Task 7).

**Produces:** `providerSelector.ts` with:
- `resolveMode()` — reads `BRAIN_MODE`, validates keys (throws on missing/invalid).
- `getActiveBrainProvider()` — returns active brain provider; in `hybrid` mode, routes per-entry lookup to the right provider (the factory returns a `BrainProvider` whose `name` reflects the active mode and the brain registry's entries carry a hint via `_localProviderName` extension — see Step 8.3).
- `getActiveVisionProvider()` — returns active vision provider.
- `getActiveBrainModels()` — returns `getBrainModels()` merged view (public).
- `getActiveProviderInfo()` — returns `{ mode, brainProviderName, visionProviderName, brainIds, visionProviderAvailable }`.

For `hybrid` mode, where two providers are active, the `BrainProvider` lookup needs to know which entry belongs to which provider. Per spec §5 Hybrid, the registry stores a discriminator per entry. The cleanest implementation: `registerBrainEntry` accepts an optional `providerName` field that `getActiveBrainProvider` consults when matching an entry. **Refinement chosen for this plan**: extend `BrainModelEntry` in `brainRegistry.ts` with an optional `providerName?: string` field (additive; no impact on existing brains that leave it undefined). For OpenCode Go brains in `opencode` mode, leave it undefined. For DeepSeek `local-*` brains, set it to `"deepseek-direct"`. Then `getActiveBrainProviderFor(modelId: string): BrainProvider` looks up the entry's `providerName`, falls back to the primary active provider. This is the natural extension and avoids the matrix lookup.

- [ ] **Step 8.1: Add `providerName` optional field to `BrainModelEntry`**

In `src/services/brainProvider.ts`, modify the interface:

```ts
export interface BrainModelEntry {
  upstream: string;
  context: number;
  maxOutput: number;
  thinking: boolean;
  inputPrice: number;
  outputPrice: number;
  endpoint: "openai" | "anthropic";
  multimodal: boolean;
  providerName?: string;
}
```

No test changes needed (additive).

- [ ] **Step 8.2: Write failing tests for `providerSelector`**

Create `tests/unit/services/providerSelector.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("dotenv/config", () => ({}));

describe("providerSelector", () => {
  beforeEach(() => {
    vi.resetModules();
    const { resetBrainRegistry } = vi.importActual?.(
      "../../../src/services/brainRegistry",
    ) as any;
    resetBrainRegistry?.();
    vi.unstubAllEnvs();
  });

  describe("resolveMode", () => {
    it("returns 'opencode' by default when BRAIN_MODE unset and OPENCODE_GO_API_KEY set", async () => {
      vi.stubEnv("BRAIN_MODE", "");
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-opencode");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      const { resolveMode } = await import(
        "../../../src/services/providerSelector"
      );
      expect(resolveMode()).toBe("opencode");
    });

    it("returns 'deepseek' when BRAIN_MODE=deepseek and DEEPSEEK_API_KEY set", async () => {
      vi.stubEnv("BRAIN_MODE", "deepseek");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-deepseek");
      const { resolveMode } = await import(
        "../../../src/services/providerSelector"
      );
      expect(resolveMode()).toBe("deepseek");
    });

    it("returns 'hybrid' when BRAIN_MODE=hybrid with both keys", async () => {
      vi.stubEnv("BRAIN_MODE", "hybrid");
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-opencode");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-deepseek");
      const { resolveMode } = await import(
        "../../../src/services/providerSelector"
      );
      expect(resolveMode()).toBe("hybrid");
    });

    it("auto mode picks deepseek when DEEPSEEK_API_KEY present", async () => {
      vi.stubEnv("BRAIN_MODE", "");
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-opencode");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-deepseek");
      const { resolveMode } = await import(
        "../../../src/services/providerSelector"
      );
      expect(resolveMode()).toBe("deepseek");
    });

    it("auto mode picks opencode when only OPENCODE_GO_API_KEY present", async () => {
      vi.stubEnv("BRAIN_MODE", "");
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-opencode");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      const { resolveMode } = await import(
        "../../../src/services/providerSelector"
      );
      expect(resolveMode()).toBe("opencode");
    });

    it("throws at startup when no brain key is set", async () => {
      vi.stubEnv("BRAIN_MODE", "");
      vi.stubEnv("OPENCODE_GO_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      await expect(async () => {
        await import("../../../src/services/providerSelector");
      }).rejects.toThrow(/OPENCODE_GO_API_KEY|DEEPSEEK_API_KEY|brain/);
    });

    it("throws when BRAIN_MODE=opencode but OPENCODE_GO_API_KEY missing", async () => {
      vi.stubEnv("BRAIN_MODE", "opencode");
      vi.stubEnv("OPENCODE_GO_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-d");
      await expect(async () => {
        await import("../../../src/services/providerSelector");
      }).rejects.toThrow(/OPENCODE_GO_API_KEY/);
    });

    it("throws when BRAIN_MODE=deepseek but DEEPSEEK_API_KEY missing", async () => {
      vi.stubEnv("BRAIN_MODE", "deepseek");
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-o");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      await expect(async () => {
        await import("../../../src/services/providerSelector");
      }).rejects.toThrow(/DEEPSEEK_API_KEY/);
    });
  });

  describe("getActiveBrainProvider / getActiveVisionProvider", () => {
    it("opencode mode resolves to OpenCodeGoBrainProvider + MimoSensesVisionProvider", async () => {
      vi.stubEnv("BRAIN_MODE", "opencode");
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-o");
      const { getActiveBrainProvider, getActiveVisionProvider } = await import(
        "../../../src/services/providerSelector"
      );
      expect(getActiveBrainProvider().name).toBe("opencode-go");
      expect(getActiveVisionProvider().name).toBe("mimo-v2.5-senses");
    });

    it("deepseek mode + MINIMAX_API_KEY resolves to DeepSeekBrainProvider + MiniMaxM3VisionProvider", async () => {
      vi.stubEnv("BRAIN_MODE", "deepseek");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-d");
      vi.stubEnv("MINIMAX_API_KEY", "sk-m");
      const { getActiveBrainProvider, getActiveVisionProvider, getActiveBrainModels } =
        await import("../../../src/services/providerSelector");
      expect(getActiveBrainProvider().name).toBe("deepseek-direct");
      expect(getActiveVisionProvider().name).toBe("minimax-m3");
      const ids = Object.keys(getActiveBrainModels());
      expect(ids).toContain("proxy/deepseek-v4-pro");
      expect(ids).toContain("proxy/deepseek-v4-flash");
      expect(ids).not.toContain("proxy/glm-5.2");
    });

    it("deepseek mode without MINIMAX_API_KEY resolves vision to null with warning", async () => {
      vi.stubEnv("BRAIN_MODE", "deepseek");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-d");
      vi.stubEnv("MINIMAX_API_KEY", "");
      const { getActiveVisionProvider } = await import(
        "../../../src/services/providerSelector"
      );
      expect(getActiveVisionProvider()).toBeNull();
    });

    it("hybrid mode registers both flavors of DeepSeek brains", async () => {
      vi.stubEnv("BRAIN_MODE", "hybrid");
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-o");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-d");
      vi.stubEnv("MINIMAX_API_KEY", "sk-m");
      const { getActiveBrainModels } = await import(
        "../../../src/services/providerSelector"
      );
      const ids = Object.keys(getActiveBrainModels());
      expect(ids).toContain("proxy/deepseek-v4-pro");
      expect(ids).toContain("proxy/local-deepseek-v4-pro");
      expect(ids).toContain("proxy/glm-5.2");
    });
  });
});
```

- [ ] **Step 8.3: Implement `providerSelector.ts`**

Create `src/services/providerSelector.ts`:

```ts
import { logger } from "../utils/logger";
import { opencodeGoBrainProvider } from "./opencodeGoBrainProvider";
import { deepseekBrainProvider } from "./deepseekBrainProvider";
import { mimoSensesVisionProvider } from "./mimoSensesVisionProvider";
import { minimaxM3VisionProvider } from "./minimaxM3VisionProvider";
import {
  BRAIN_MODELS_BASE,
  registerBrainEntry,
  resetBrainRegistry,
  getBrainModels,
} from "./brainRegistry";
import type {
  BrainModelEntry,
  BrainProvider,
} from "./brainProvider";
import type { VisionProvider } from "./visionProvider";

export type ResolvedMode = "opencode" | "deepseek" | "hybrid";

export interface ProviderInfo {
  mode: ResolvedMode;
  brainProviderName: string;
  visionProviderName: string | null;
  visionProviderAvailable: boolean;
  brainIds: string[];
  primaryBrainProviderName: string;
  hybridProviders: string[];
}

function readBRAIN_MODE(): string {
  return (process.env.BRAIN_MODE ?? "auto").toLowerCase().trim();
}

export function resolveMode(): ResolvedMode {
  const raw = readBRAIN_MODE();
  const hasOpencode = !!process.env.OPENCODE_GO_API_KEY;
  const hasDeepseek = !!process.env.DEEPSEEK_API_KEY;
  const hasMinimax = !!process.env.MINIMAX_API_KEY;

  if (raw === "opencode" || raw === "deepseek" || raw === "hybrid") {
    if (raw === "opencode" && !hasOpencode) {
      throw new Error("BRAIN_MODE=opencode requiere OPENCODE_GO_API_KEY en .env");
    }
    if (raw === "deepseek" && !hasDeepseek) {
      throw new Error("BRAIN_MODE=deepseek requiere DEEPSEEK_API_KEY en .env");
    }
    if (raw === "hybrid" && !hasOpencode && !hasDeepseek) {
      throw new Error(
        "BRAIN_MODE=hybrid requiere OPENCODE_GO_API_KEY o DEEPSEEK_API_KEY",
      );
    }
    return raw;
  }

  // auto or any unrecognized value treated as auto
  if (hasDeepseek) {
    if (hasOpencode) {
      logger.warn(
        "OPENCODE_GO_API_KEY presente pero ignorado porque DEEPSEEK_API_KEY ganó (BRAIN_MODE=auto). Set BRAIN_MODE=hybrid para usar ambos.",
      );
    }
    return "deepseek";
  }
  if (hasOpencode) return "opencode";

  throw new Error(
    "No hay API key de brain configurada. Set OPENCODE_GO_API_KEY (modo opencode), DEEPSEEK_API_KEY (modo deepseek), o ambas (BRAIN_MODE=hybrid).",
  );
}

function registerDeepSeekEntries(prefix: "proxy/" | "proxy/local-"): void {
  const proEntry: BrainModelEntry = {
    upstream: "deepseek-v4-pro",
    context: 1_048_576,
    maxOutput: 384_000,
    thinking: true,
    inputPrice: 0.435,
    outputPrice: 0.87,
    endpoint: "openai",
    multimodal: false,
    providerName: "deepseek-direct",
  };
  const flashEntry: BrainModelEntry = {
    upstream: "deepseek-v4-flash",
    context: 1_048_576,
    maxOutput: 384_000,
    thinking: true,
    inputPrice: 0.14,
    outputPrice: 0.28,
    endpoint: "openai",
    multimodal: false,
    providerName: "deepseek-direct",
  };
  registerBrainEntry(`${prefix}deepseek-v4-pro`, proEntry);
  registerBrainEntry(`${prefix}deepseek-v4-flash`, flashEntry);
}

let cachedMode: ResolvedMode | null = null;
let cachedBrainProvider: BrainProvider | null = null;
let cachedVisionProvider: VisionProvider | null = null;
let cachedVisionAvailable = false;
let cachedInfo: ProviderInfo | null = null;

function ensureInitialized(): ProviderInfo {
  if (cachedInfo) return cachedInfo;

  resetBrainRegistry();
  const mode = resolveMode();
  cachedMode = mode;

  if (mode === "deepseek") {
    registerDeepSeekEntries("proxy/");
    cachedBrainProvider = deepseekBrainProvider;
    if (process.env.MINIMAX_API_KEY) {
      cachedVisionProvider = minimaxM3VisionProvider;
      cachedVisionAvailable = true;
    } else {
      logger.warn(
        "MINIMAX_API_KEY no presente en modo deepseek. Vision deshabilitada; contenido multimodal fallará con error claro.",
      );
      cachedVisionProvider = null;
      cachedVisionAvailable = false;
    }
  } else if (mode === "opencode") {
    cachedBrainProvider = opencodeGoBrainProvider;
    cachedVisionProvider = mimoSensesVisionProvider;
    cachedVisionAvailable = true;
  } else {
    // hybrid
    registerDeepSeekEntries("proxy/local-");
    cachedBrainProvider = opencodeGoBrainProvider;
    if (process.env.MINIMAX_API_KEY) {
      cachedVisionProvider = minimaxM3VisionProvider;
    } else {
      cachedVisionProvider = mimoSensesVisionProvider;
    }
    cachedVisionAvailable = true;
  }

  const brainIds = Object.keys(getBrainModels()).sort();
  cachedInfo = {
    mode,
    brainProviderName: cachedBrainProvider.name,
    visionProviderName: cachedVisionProvider?.name ?? null,
    visionProviderAvailable: cachedVisionAvailable,
    brainIds,
    primaryBrainProviderName: cachedBrainProvider.name,
    hybridProviders:
      mode === "hybrid"
        ? Array.from(
            new Set(
              Object.values(getBrainModels()).map(
                (e) => e.providerName ?? "opencode-go",
              ),
            ),
          )
        : [],
  };
  return cachedInfo;
}

export function getActiveBrainProvider(): BrainProvider {
  return ensureInitialized().primaryBrainProviderName === "" || !cachedBrainProvider
    ? opencodeGoBrainProvider
    : cachedBrainProvider;
}

export function getActiveBrainProviderFor(modelId: string): BrainProvider {
  const entry = getBrainModels()[modelId];
  if (!entry || !entry.providerName) {
    return ensureInitialized().primaryBrainProviderName === "opencode-go"
      ? opencodeGoBrainProvider
      : deepseekBrainProvider;
  }
  if (entry.providerName === "deepseek-direct") return deepseekBrainProvider;
  return opencodeGoBrainProvider;
}

export function getActiveVisionProvider(): VisionProvider | null {
  ensureInitialized();
  return cachedVisionProvider;
}

export function getActiveBrainModels(): Record<string, BrainModelEntry> {
  return getBrainModels();
}

export function getActiveProviderInfo(): ProviderInfo {
  return ensureInitialized();
}

// Eagerly init at module load to surface startup errors immediately.
// (The lazy init above still works for tests that want to reset env.)
try {
  ensureInitialized();
} catch (err) {
  throw err;
}

void BRAIN_MODELS_BASE; // keep base import to ensure the module side-effects apply
```

- [ ] **Step 8.4: Run the tests**

Run: `npm run test:unit -- providerSelector`
Expected: PASS — all 13 tests.

- [ ] **Step 8.5: Run lint and build**

Run: `npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 8.6: Commit**

```bash
git add src/services/brainProvider.ts \
        src/services/providerSelector.ts \
        tests/unit/services/providerSelector.test.ts
git commit -m "feat(services): providerSelector (BRAIN_MODE resolver + factory)"
```

---

## Task 9: Refactor `multimodalProcessor` to consume `VisionProvider` interface

**Files:**
- Modify: `src/middleware/multimodalProcessor.ts`
- Modify: `tests/unit/middleware/multimodalProcessor.test.ts`

**Consumes:** `VisionProvider` interface (Task 2); `getActiveVisionProvider`, `getActiveBrainProviderFor`, `getActiveBrainProvider` (Task 8).

**Produces:** `processMultimodalContent(messages, modelName?, brainEntry?, visionProvider?)`. Dispatch:
- Image or video content: if `visionProvider?.supportsContentType(t)`, use it; else fallback to `geminiService.analyzeContent`. On `describeImage` throw, fallback to Gemini.
- Audio content: always `geminiService.analyzeContent` (no provider supports audio).
- PDF content: `pdfProcessor.analyzePDF` with Gemini fallback (unchanged).

The existing tests mock `mimoSensesService.describeImage`; they now mock `visionProvider.describeImage`. Update the mock target from the old singleton to `getActiveVisionProvider()`.

- [ ] **Step 9.1: Update the mock in `tests/unit/middleware/multimodalProcessor.test.ts`**

At the top of `tests/unit/middleware/multimodalProcessor.test.ts`, replace the `vi.mock("../../../src/services/mimoSensesService", ...)` block with:

```ts
vi.mock("../../../src/services/providerSelector", () => ({
  getActiveVisionProvider: () => ({
    name: "test-vision",
    isAvailable: () => true,
    supportsContentType: (t: string) => t === "image" || t === "video",
    describeImage: (...args: any[]) => mockDescribeImage(...args),
  }),
  getActiveBrainProvider: () => ({ name: "test-brain" }),
  getActiveBrainProviderFor: () => ({ name: "test-brain" }),
  getActiveBrainModels: () => ({}),
  getActiveProviderInfo: () => ({}),
}));
```

- [ ] **Step 9.2: Rewrite `processMultimodalContent` to accept optional vision provider and dispatch on content type**

In `src/middleware/multimodalProcessor.ts`:

- Add at top of file:
```ts
import {
  getActiveVisionProvider,
} from "../services/providerSelector";
import type { VisionProvider, VisionContentType } from "../services/visionProvider";
```

- Modify the function signature:
```ts
export async function processMultimodalContent(
  messages: ChatMessage[],
  modelName?: string,
  brainEntry?: BrainModelEntry,
  visionProvider?: VisionProvider | null,
): Promise<{
  processedMessages: ChatMessage[];
  useDeepseekDirectly: boolean;
  strategy: "direct" | "vision" | "vision-mimo" | "local" | "mixed";
}> {
```

- Replace the `useMimoForImages` block (currently at lines 42-46 of `multimodalProcessor.ts`):
```ts
  const resolvedBrain = brainEntry ?? (modelName ? getBrainEntry(modelName) : undefined);
  const isMultimodalNative = resolvedBrain?.multimodal === true;
  const activeVision = visionProvider ?? getActiveVisionProvider();
  const imageVisionProvider = activeVision ?? undefined;
```

- In the `visionContent.map(async ...)` block (currently at lines 115-143), replace the `useMimo` and `processor` logic to dispatch on content type:

```ts
    const visionDescriptions = await Promise.all(
      visionContent.map(async (content, index) => {
        const vision =
          imageVisionProvider &&
          imageVisionProvider.supportsContentType(content.type as VisionContentType)
            ? imageVisionProvider
            : null;
        const processor = vision
          ? (vision.name === "mimo-v2.5-senses" ? "MiMo V2.5" : vision.name === "minimax-m3" ? "MiniMax M3" : "Vision")
          : "Gemini";
        logger.info(
          `Procesando ${content.type} ${index + 1}/${visionContent.length} con ${processor}...`,
        );
        try {
          if (vision && content.type === "image") {
            return await vision.describeImage(content.source, userContext);
          }
          return await geminiService.analyzeContent(content, userContext);
        } catch (error: unknown) {
          if (vision) {
            logger.warn(
              `${vision.name} fallo para ${content.type} ${index + 1}: ${getErrorMessage(error)}. Fallback a Gemini...`,
            );
          }
          return await geminiService.analyzeContent(content, userContext);
        }
      }),
    );
```

- Update the `usedMimo` variable (currently at line 233):
```ts
  const usedActiveVision = visionContent.some(
    (c) => imageVisionProvider?.supportsContentType(c.type as VisionContentType) ?? false,
  );
  let strategy:
    | "direct"
    | "vision"
    | "vision-mimo"
    | "local"
    | "mixed" = "mixed";
  if (visionContent.length > 0 && localContent.length === 0)
    strategy = usedActiveVision ? "vision-mimo" : "vision";
  else if (visionContent.length === 0 && localContent.length > 0)
    strategy = "local";
```

- [ ] **Step 9.3: Add a test that the new dispatch respects `supportsContentType`**

Append to `tests/unit/middleware/multimodalProcessor.test.ts`:

```ts
it("routes image content through the active VisionProvider when supportsContentType('image')=true", async () => {
  mockDescribeImage.mockResolvedValue("described by active vision");
  const messages: ChatMessage[] = [
    {
      role: "user",
      content: "look",
    },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: "https://x/y.png" } } as any,
      ],
    },
  ];
  const result = await processMultimodalContent(messages);
  expect(mockDescribeImage).toHaveBeenCalledWith("https://x/y.png", expect.any(String));
  expect(result.strategy).toBe("vision-mimo");
});
```

- [ ] **Step 9.4: Run all unit tests**

Run: `npm run test:unit`
Expected: PASS — multimodalProcessor tests updated.

- [ ] **Step 9.5: Run lint and build**

Run: `npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 9.6: Commit**

```bash
git add src/middleware/multimodalProcessor.ts tests/unit/middleware/multimodalProcessor.test.ts
git commit -m "refactor(middleware): dispatch on VisionProvider.supportsContentType with Gemini fallback"
```

---

## Task 10: Refactor `src/index.ts` to use `providerSelector`

**Files:**
- Modify: `src/index.ts`
- (no test changes; existing tests for `index.ts` endpoints use the active services through `processMultimodalContent`, which is already updated in Task 9)

**Consumes:** All providers + `getActiveBrainProviderFor`, `getActiveVisionProvider`, `getActiveBrainModels`, `getActiveProviderInfo` (Task 8).

**Produces:** `src/index.ts` resolves the brain provider via `getActiveBrainProviderFor(modelId)` per request (so `hybrid` mode routes the right entry to the right provider). `/v1/models` calls `getActiveBrainModels()`. `/health` calls `getActiveProviderInfo()`.

- [ ] **Step 10.1: Replace imports and call sites in `src/index.ts`**

In `src/index.ts`, search for `opencodeGoService` and replace each occurrence with the dispatch pattern. Specifically:

- Remove the import:
```ts
import { opencodeGoService } from "./services/opencodeGoService";
```
Replace with:
```ts
import {
  getActiveBrainProvider,
  getActiveBrainProviderFor,
  getActiveBrainModels,
  getActiveProviderInfo,
  getActiveVisionProvider,
} from "./services/providerSelector";
```

- Find the call sites: `grep -n "opencodeGoService" src/index.ts`. For each non-stream + each stream call, replace `opencodeGoService.createChatCompletion(...)` with `getActiveBrainProviderFor(modelId).createChatCompletion(...)` and the equivalent for `.chatCompletionStream(...)`.

- In the `/v1/models` handler, replace the call that lists brains (search for `getOpenCodeModelsList` and `Object.keys(BRAIN_MODELS)`) with `Object.keys(getActiveBrainModels())`.

- In the `/health` handler, add `mode: getActiveProviderInfo()` to the response body.

- In the route handler that calls `processMultimodalContent`, ensure the third argument is the active vision provider: `processMultimodalContent(messages, modelName, brainEntry, getActiveVisionProvider())`.

- [ ] **Step 10.2: Verify no stale references remain**

Run: `grep -rn "opencodeGoService\|mimoSensesService" src/`
Expected: 0 hits (outside the new provider files themselves).

- [ ] **Step 10.3: Run lint, build, tests**

Run: `npm run lint && npm run build && npm run test:unit`
Expected: PASS — all existing tests still pass with the new dispatch.

- [ ] **Step 10.4: Commit**

```bash
git add src/index.ts
git commit -m "refactor(index): dispatch via providerSelector (active brain per request, hybrid-aware)"
```

---

## Task 11: Update `.env.example` with `BRAIN_MODE`

**Files:**
- Modify: `.env.example`

**Consumes:** Spec §7.

**Produces:** Documentation of `BRAIN_MODE`, `DEEPSEEK_*`, `MINIMAX_*` env vars with comments.

- [ ] **Step 11.1: Update `.env.example`**

Replace the top of `.env.example` (the OpenCode Go block) with:

```bash
# ========================================
# BRAIN MODE (REQUIRED para elegir provider)
# ========================================
# opencode → solo brains OpenCode Go + MiMo V2.5 vision.
#            Default si no se setea (equivalente a auto con solo OPENCODE_GO_API_KEY).
# deepseek → solo brains DeepSeek V4 Pro/Flash (tu cuenta) + MiniMax M3 vision (si MINIMAX_API_KEY).
# hybrid   → ambos providers activos; DeepSeek bajo IDs proxy/local-deepseek-v4-*.
# auto     → elige opencode o deepseek segun las keys presentes (deepseek gana si esta; warning si OPENCODE_GO_API_KEY tambien esta).
BRAIN_MODE=auto

# ========================================
# OPENCODE GO (brains + MiMo V2.5 senses)
# ========================================
# Requerido para BRAIN_MODE=opencode o hybrid
OPENCODE_GO_API_KEY=sk-your-opencode-go-key
OPENCODE_GO_BASE_URL=https://opencode.ai/zen/go/v1
OPENCODE_GO_TIMEOUT_MS=120000

# ========================================
# DEEPSEEK (brain alternativo)
# ========================================
# Requerido para BRAIN_MODE=deepseek o hybrid.
# Cuando deepseek, las IDs proxy/deepseek-v4-{pro,flash} se registran apuntando a TU cuenta.
# Cuando hybrid, se registran como proxy/local-deepseek-v4-{pro,flash} (OpenCode Go flavor queda bajo proxy/deepseek-v4-{pro,flash}).
DEEPSEEK_API_KEY=sk-your-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_TIMEOUT_MS=120000

# ========================================
# MINIMAX M3 VISION (opcional, primario si esta presente)
# ========================================
# Vision alternativo a MiMo V2.5. Si esta presente, se usa en modos deepseek y hybrid.
# Si no, vision queda en MiMo V2.5 (opencode/hybrid) o deshabilitada (deepseek puro).
MINIMAX_API_KEY=your-minimax-key
MINIMAX_BASE_URL=https://api.minimax.io/anthropic
SENSES_MODEL=MiniMax-M3
SENSES_TIMEOUT_MS=120000
```

- [ ] **Step 11.2: Commit**

```bash
git add .env.example
git commit -m "docs(env): document BRAIN_MODE and DEEPSEEK/MINIMAX provider env vars"
```

---

## Task 12: Update `README.md`, `CLAUDE.md`, `MODELS.md`

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `MODELS.md`

**Consumes:** Spec §Migration and Backwards Compatibility.

**Produces:** User-facing docs that describe the four `BRAIN_MODE` values, the new pricing for `proxy/deepseek-v4-pro` ($0.435/$0.87), and the `proxy/local-deepseek-v4-*` IDs in hybrid.

- [ ] **Step 12.1: Update `README.md`**

In the architecture section, add a "Modes" subsection between the current "Configuration" and "Quick Start" sections:

````markdown
### Modes

The proxy supports four `BRAIN_MODE` values:

- `auto` (default) — picks `deepseek` if `DEEPSEEK_API_KEY` is set, else `opencode` if `OPENCODE_GO_API_KEY` is set, else fatal at startup.
- `opencode` — only OpenCode Go brains (`proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro`) + MiMo V2.5 vision. Requires `OPENCODE_GO_API_KEY`.
- `deepseek` — only DeepSeek brains under their standard IDs (`proxy/deepseek-v4-pro`, `proxy/deepseek-v4-flash`) + MiniMax M3 vision (if `MINIMAX_API_KEY` set). Requires `DEEPSEEK_API_KEY`.
- `hybrid` — both providers loaded. OpenCode Go brains under `proxy/<id>`; user's DeepSeek under `proxy/local-deepseek-v4-{pro,flash}`. Vision follows `MINIMAX_API_KEY`.

To switch modes, set `BRAIN_MODE` in `.env` and restart. Existing clients (`opencode.json`) need no changes.
````

In the pricing table (where DeepSeek V4 Pro is currently $1.74/$3.48), update:

```
| proxy/deepseek-v4-pro | $0.435 / $0.87 per 1M (combined $0.435 + senses) |
```

Add a row to the models list for hybrid:

```
| proxy/local-deepseek-v4-pro  | DeepSeek V4 Pro via your account (BRAIN_MODE=hybrid) |
| proxy/local-deepseek-v4-flash | DeepSeek V4 Flash via your account (BRAIN_MODE=hybrid) |
```

- [ ] **Step 12.2: Update `CLAUDE.md`**

- In § Models section, after the `proxy/mimo-v2.5-pro` line, add:
  ```
  - Hybrid-only brains (BRAIN_MODE=hybrid only): `proxy/local-deepseek-v4-pro`, `proxy/local-deepseek-v4-flash`
  ```
- In § Pricing, update:
  ```
  - DeepSeek V4 Pro: $0.435 in / $0.87 out per 1M (post-June 2026 price cut; previous $1.74/$3.48 was pre-cut)
  ```
- Add a new § Modes section after § Architecture:
  ```
  ## Modes
  
  `BRAIN_MODE` env var: `auto` (default) | `opencode` | `deepseek` | `hybrid`. See `BRAIN_MODE` block in `.env.example`. Mode selection happens at startup; clients (`opencode.json`, Claude Code mappings) don't change.
  ```

- [ ] **Step 12.3: Update `MODELS.md`**

In the Brain Models table, update DeepSeek V4 Pro row:
- `cost` from $1.74/$3.48 → $0.435/$0.87
- `combined` from $1.88/$3.48 → $0.575/$1.15

Add two rows:
```
| `proxy/local-deepseek-v4-pro`  | `deepseek-v4-pro` | OpenAI | ✅ | 800K | 384K | $0.435 / $0.87 | (your account) |
| `proxy/local-deepseek-v4-flash` | `deepseek-v4-flash` | OpenAI | ✅ | 800K | 384K | $0.14 / $0.28 | (your account) |
```

Add a "Modes" note to the doc intro:
```
**Modes**: `BRAIN_MODE=auto` (default) | `opencode` | `deepseek` | `hybrid`. See README "Modes" section. DeepSeek V4 Pro pricing reflects June 2026 cut ($0.435/$0.87).
```

- [ ] **Step 12.4: Commit**

```bash
git add README.md CLAUDE.md MODELS.md
git commit -m "docs: document BRAIN_MODE modes and updated DeepSeek pricing"
```

---

## Task 13: Final verification

**Files:**
- None (verification only)

**Consumes:** All previous tasks.

**Produces:** A clean green CI-style verification report.

- [ ] **Step 13.1: Run lint**

Run: `npm run lint`
Expected: PASS, no errors, no warnings.

- [ ] **Step 13.2: Run build**

Run: `npm run build`
Expected: PASS, `dist/` regenerated.

- [ ] **Step 13.3: Run unit tests**

Run: `npm run test:unit`
Expected: PASS — all suites green. The renamed tests (opencodeGoBrainProvider, mimoSensesVisionProvider) plus 3 new test suites (deepseekBrainProvider, minimaxM3VisionProvider, providerSelector) plus updated suites (brainRegistry, multimodalProcessor).

- [ ] **Step 13.4: Manual env matrix smoke test**

Run a sequence to verify the env switch at module-init time:

```bash
# 1. auto + only OPENCODE_GO_API_KEY → mode=opencode, public path
OPENCODE_GO_API_KEY=sk-x BRAIN_MODE=auto node -e "require('dotenv/config'); const p=require('./src/services/providerSelector'); console.log(p.getActiveProviderInfo())" 2>&1 | head -20

# 2. auto + DEEPSEEK_API_KEY → mode=deepseek
DEEPSEEK_API_KEY=sk-d BRAIN_MODE=auto MINIMAX_API_KEY=sk-m node -e "require('dotenv/config'); const p=require('./src/services/providerSelector'); console.log(p.getActiveProviderInfo())" 2>&1 | head -20

# 3. hybrid + both keys
OPENCODE_GO_API_KEY=sk-x DEEPSEEK_API_KEY=sk-d MINIMAX_API_KEY=sk-m BRAIN_MODE=hybrid node -e "require('dotenv/config'); const p=require('./src/services/providerSelector'); console.log(p.getActiveProviderInfo())" 2>&1 | head -20
```

Expected: each prints a valid `ProviderInfo` with the right `mode`, provider names, and brain IDs.

- [ ] **Step 13.5: Verify zero stale references in `src/`**

Run: `grep -rn "opencodeGoService\|mimoSensesService" src/ | grep -v "opencodeGoBrainProvider\|mimoSensesVisionProvider"`
Expected: empty output. Old singleton names fully retired.

- [ ] **Step 13.6: Check git log is clean**

Run: `git log --oneline main..HEAD`
Expected: 13 commits (Tasks 1-12 plus the 2 spec commits already in place), each with a focused message and no leftover WIP markers.

- [ ] **Step 13.7: Tag the milestone (no push)**

```bash
git tag -a v3.1.0-pluggable-providers -m "Pluggable brain and vision providers via BRAIN_MODE"
```

(DO NOT push. Tagging locally marks the milestone for review.)

---

## Self-Review

### 1. Spec coverage

| Spec section | Plan task(s) |
|---|---|
| §1 Architecture diagram | Task 2 (interfaces), Task 3, 4, 5, 6 (impls), Task 8 (factory) |
| §2 Components | Tasks 1, 2, 3, 4, 5, 6, 7, 8 |
| §3 `BrainProvider` interface | Task 2 |
| §4 `VisionProvider` interface | Task 2 |
| §5 `providerSelector` (BRAIN_MODE + detection matrix) | Task 8 |
| §6 Data Flow (opencode, deepseek, hybrid, auto) | Tasks 9, 10 |
| §7 `.env.example` | Task 11 |
| §8 Error Handling (retry curve, vision fallback, audio, missing-env) | Tasks 5, 6, 8, 9 |
| §9 Testing (new + updated) | Tasks 1, 5, 6, 7, 8, 9 |
| §Migration (public, deepseek, hybrid, no breaking) | Tasks 10, 11, 12 |
| Pricing update | Tasks 7, 12 |
| `parseLocalProxyModelId` | Task 7 |
| Hybrid per-entry provider discriminator (`providerName` field) | Task 8 (Step 8.1 adds field, 8.3 uses it) |

No spec requirement found without a corresponding task.

### 2. Placeholder scan

Searched the plan for: TBD, TODO, "implement later", "fill in", "similar to Task N", "Add appropriate error handling". Found 0 hits in task bodies. Each step with code changes shows the actual code. Two cross-references ("Similar to `OpenCodeGoBrainProvider.createChatCompletion`" in Task 5) include full code, not placeholders.

### 3. Type consistency

- `BrainProvider` interface defined in Task 2 with signature including `chatCompletionStream(... signal?: AbortSignal)`. Used consistently in Tasks 3, 5, 8, 10.
- `VisionProvider` interface defined in Task 2 with `supportsContentType(type: VisionContentType)`. Used in Tasks 4, 6, 8, 9.
- `BrainModelEntry.providerName?` added in Task 8.1 (additive). All base brains in `BRAIN_MODELS_BASE` leave it undefined (default to `"opencode-go"` provider). DeepSeek entries set it to `"deepseek-direct"`. `getActiveBrainProviderFor` consults it. Consistent.
- `registerBrainEntry`, `getBrainModels`, `parseLocalProxyModelId`, `resetBrainRegistry` all defined in Task 7 with identical signatures in Tasks 8, 9.
- `parseLocalProxyModelId` strips `proxy/local-` prefix. Called nowhere directly in the plan; added in Task 7 as a future helper for clients that need raw upstream names. (Could be wired into `index.ts` in Task 10 if needed; left optional — the `BrainModelEntry.upstream` already carries the upstream name for the brain calls themselves; the entry just exposes the friendly ID.)
