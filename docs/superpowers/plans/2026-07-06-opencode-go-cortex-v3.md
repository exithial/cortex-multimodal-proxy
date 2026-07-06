# Cortex Sensorial v3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DeepSeek-as-brain + Gemini-as-senses with OpenCode Go models. MiMo V2.5 replaces Gemini for images; 9 text-only brains exposed via `proxy/<model-id>`; natively multimodal models passthrough. Rename project to `cortex-multimodal-proxy`.

**Architecture:** "Cortex Sensorial v3" — proxy routes text-only brain models through MiMo V2.5 senses for images; Gemini fallback for audio/video/PDFs. OpenAI-format models (GLM, Kimi, DeepSeek, MiMo) use `/v1/chat/completions`; Anthropic-format models (Qwen) use `/v1/messages` at OpenCode Go.

**Tech Stack:** Node.js 20+, TypeScript, Express, Axios, Vitest. OpenCode Go at `https://opencode.ai/zen/go/v1/`.

**Spec:** `docs/superpowers/specs/2026-07-06-opencode-go-cortex-sensorial-v3-design.md`

---

### Task 1: Brain Registry

**Files:**
- Create: `src/services/brainRegistry.ts`
- Create: `tests/unit/services/brainRegistry.test.ts`

- [ ] **Step 1: Write failing tests for brainRegistry**

```ts
// tests/unit/services/brainRegistry.test.ts
import { describe, it, expect } from "vitest";
import {
  BRAIN_MODELS,
  PASSTHROUGH_MODELS,
  getBrainEntry,
  isPassthrough,
  parseProxyModelId,
  isKnownModel,
} from "../../src/services/brainRegistry";

describe("brainRegistry", () => {
  describe("BRAIN_MODELS", () => {
    it("should contain 9 text-only brain entries", () => {
      expect(Object.keys(BRAIN_MODELS)).toHaveLength(9);
    });

    it("each entry should have required fields", () => {
      for (const [id, entry] of Object.entries(BRAIN_MODELS)) {
        expect(id).toMatch(/^proxy\//);
        expect(entry.upstream).toBeTruthy();
        expect(entry.context).toBeGreaterThan(0);
        expect(entry.maxOutput).toBeGreaterThan(0);
        expect(typeof entry.thinking).toBe("boolean");
        expect(["openai", "anthropic"]).toContain(entry.endpoint);
        expect(entry.inputPrice).toBeGreaterThanOrEqual(0);
        expect(entry.outputPrice).toBeGreaterThanOrEqual(0);
      }
    });

    it("should include proxy/deepseek-v4-pro", () => {
      expect(BRAIN_MODELS["proxy/deepseek-v4-pro"]).toBeDefined();
      expect(BRAIN_MODELS["proxy/deepseek-v4-pro"].upstream).toBe("deepseek-v4-pro");
      expect(BRAIN_MODELS["proxy/deepseek-v4-pro"].thinking).toBe(true);
    });

    it("should include proxy/kimi-k2.6", () => {
      expect(BRAIN_MODELS["proxy/kimi-k2.6"]).toBeDefined();
      expect(BRAIN_MODELS["proxy/kimi-k2.6"].upstream).toBe("kimi-k2.6");
      expect(BRAIN_MODELS["proxy/kimi-k2.6"].thinking).toBe(false);
    });

    it("qwen brains should use anthropic endpoint", () => {
      expect(BRAIN_MODELS["proxy/qwen3.7-max"].endpoint).toBe("anthropic");
      expect(BRAIN_MODELS["proxy/qwen3.7-plus"].endpoint).toBe("anthropic");
      expect(BRAIN_MODELS["proxy/qwen3.6-plus"].endpoint).toBe("anthropic");
    });

    it("non-qwen brains should use openai endpoint", () => {
      expect(BRAIN_MODELS["proxy/kimi-k2.6"].endpoint).toBe("openai");
      expect(BRAIN_MODELS["proxy/glm-5.2"].endpoint).toBe("openai");
      expect(BRAIN_MODELS["proxy/deepseek-v4-flash"].endpoint).toBe("openai");
    });
  });

  describe("PASSTHROUGH_MODELS", () => {
    it("should contain 4 natively multimodal models", () => {
      expect(PASSTHROUGH_MODELS.size).toBe(4);
      expect(PASSTHROUGH_MODELS.has("mimo-v2.5")).toBe(true);
      expect(PASSTHROUGH_MODELS.has("mimo-v2.5-pro")).toBe(true);
      expect(PASSTHROUGH_MODELS.has("minimax-m3")).toBe(true);
      expect(PASSTHROUGH_MODELS.has("minimax-m2.7")).toBe(true);
    });
  });

  describe("getBrainEntry", () => {
    it("should return brain entry for valid proxy model", () => {
      const entry = getBrainEntry("proxy/deepseek-v4-pro");
      expect(entry).toBeDefined();
      expect(entry!.upstream).toBe("deepseek-v4-pro");
    });

    it("should return undefined for unknown model", () => {
      expect(getBrainEntry("unknown-model")).toBeUndefined();
    });

    it("should return undefined for passthrough model", () => {
      expect(getBrainEntry("mimo-v2.5")).toBeUndefined();
    });
  });

  describe("isPassthrough", () => {
    it("should return true for natively multimodal models", () => {
      expect(isPassthrough("mimo-v2.5")).toBe(true);
      expect(isPassthrough("minimax-m3")).toBe(true);
    });

    it("should return false for brain models", () => {
      expect(isPassthrough("proxy/deepseek-v4-pro")).toBe(false);
    });

    it("should return false for unknown models", () => {
      expect(isPassthrough("unknown")).toBe(false);
    });
  });

  describe("parseProxyModelId", () => {
    it("should extract upstream from proxy model id", () => {
      expect(parseProxyModelId("proxy/deepseek-v4-pro")).toBe("deepseek-v4-pro");
      expect(parseProxyModelId("proxy/kimi-k2.6")).toBe("kimi-k2.6");
    });

    it("should return null for non-proxy models", () => {
      expect(parseProxyModelId("mimo-v2.5")).toBeNull();
      expect(parseProxyModelId("unknown")).toBeNull();
    });
  });

  describe("isKnownModel", () => {
    it("should return true for brain models", () => {
      expect(isKnownModel("proxy/deepseek-v4-pro")).toBe(true);
    });

    it("should return true for passthrough models", () => {
      expect(isKnownModel("mimo-v2.5")).toBe(true);
    });

    it("should return false for unknown models", () => {
      expect(isKnownModel("unknown")).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node ./node_modules/vitest/vitest.mjs run tests/unit/services/brainRegistry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement brainRegistry**

```ts
// src/services/brainRegistry.ts
export interface BrainModelEntry {
  upstream: string;
  context: number;
  maxOutput: number;
  thinking: boolean;
  inputPrice: number;
  outputPrice: number;
  endpoint: "openai" | "anthropic";
}

export const BRAIN_MODELS: Record<string, BrainModelEntry> = {
  "proxy/kimi-k2.7-code": {
    upstream: "kimi-k2.7-code",
    context: 262144,
    maxOutput: 262144,
    thinking: false,
    inputPrice: 0.95,
    outputPrice: 4.0,
    endpoint: "openai",
  },
  "proxy/kimi-k2.6": {
    upstream: "kimi-k2.6",
    context: 262144,
    maxOutput: 65536,
    thinking: false,
    inputPrice: 0.95,
    outputPrice: 4.0,
    endpoint: "openai",
  },
  "proxy/glm-5.2": {
    upstream: "glm-5.2",
    context: 1048576,
    maxOutput: 131072,
    thinking: true,
    inputPrice: 1.4,
    outputPrice: 4.4,
    endpoint: "openai",
  },
  "proxy/glm-5.1": {
    upstream: "glm-5.1",
    context: 202752,
    maxOutput: 32768,
    thinking: true,
    inputPrice: 1.4,
    outputPrice: 4.4,
    endpoint: "openai",
  },
  "proxy/qwen3.7-plus": {
    upstream: "qwen3.7-plus",
    context: 1048576,
    maxOutput: 65536,
    thinking: false,
    inputPrice: 0.4,
    outputPrice: 1.6,
    endpoint: "anthropic",
  },
  "proxy/qwen3.7-max": {
    upstream: "qwen3.7-max",
    context: 1048576,
    maxOutput: 65536,
    thinking: true,
    inputPrice: 2.5,
    outputPrice: 7.5,
    endpoint: "anthropic",
  },
  "proxy/qwen3.6-plus": {
    upstream: "qwen3.6-plus",
    context: 1048576,
    maxOutput: 65536,
    thinking: false,
    inputPrice: 0.5,
    outputPrice: 3.0,
    endpoint: "anthropic",
  },
  "proxy/deepseek-v4-flash": {
    upstream: "deepseek-v4-flash",
    context: 1048576,
    maxOutput: 384000,
    thinking: true,
    inputPrice: 0.14,
    outputPrice: 0.28,
    endpoint: "openai",
  },
  "proxy/deepseek-v4-pro": {
    upstream: "deepseek-v4-pro",
    context: 1048576,
    maxOutput: 384000,
    thinking: true,
    inputPrice: 1.74,
    outputPrice: 3.48,
    endpoint: "openai",
  },
};

export const PASSTHROUGH_MODELS = new Set([
  "mimo-v2.5",
  "mimo-v2.5-pro",
  "minimax-m3",
  "minimax-m2.7",
]);

export function getBrainEntry(modelId: string): BrainModelEntry | undefined {
  return BRAIN_MODELS[modelId];
}

export function isPassthrough(modelId: string): boolean {
  return PASSTHROUGH_MODELS.has(modelId);
}

export function parseProxyModelId(modelId: string): string | null {
  if (modelId.startsWith("proxy/")) {
    return modelId.substring(6);
  }
  return null;
}

export function isKnownModel(modelId: string): boolean {
  return modelId in BRAIN_MODELS || PASSTHROUGH_MODELS.has(modelId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node ./node_modules/vitest/vitest.mjs run tests/unit/services/brainRegistry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/brainRegistry.ts tests/unit/services/brainRegistry.test.ts
git commit -m "feat: add brainRegistry with 9 text-only brains and 4 passthrough models"
```

---

### Task 2: MiMo Senses Service

**Files:**
- Create: `src/services/mimoSensesService.ts`
- Create: `tests/unit/services/mimoSensesService.test.ts`

- [ ] **Step 1: Write failing tests for mimoSensesService**

```ts
// tests/unit/services/mimoSensesService.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios");
vi.mock("dotenv/config", () => ({}));

describe("MiMoSensesService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("isAvailable", () => {
    it("should return true when OPENCODE_GO_API_KEY is set", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { mimoSensesService } = await import("../../src/services/mimoSensesService");
      expect(mimoSensesService.isAvailable()).toBe(true);
      vi.unstubAllEnvs();
    });

    it("should return false when OPENCODE_GO_API_KEY is not set", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "");
      const { mimoSensesService } = await import("../../src/services/mimoSensesService");
      expect(mimoSensesService.isAvailable()).toBe(false);
      vi.unstubAllEnvs();
    });
  });

  describe("describeImage", () => {
    it("should call OpenCode Go /chat/completions with image content", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const axios = await import("axios");
      const postSpy = vi.spyOn(axios.default, "post").mockResolvedValue({
        data: {
          choices: [
            { message: { content: "A screenshot of a VS Code editor" } },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        },
      });

      const { mimoSensesService } = await import("../../src/services/mimoSensesService");

      const result = await mimoSensesService.describeImage(
        "data:image/png;base64,abc123",
        "describe this screenshot",
      );

      expect(result).toBe("A screenshot of a VS Code editor");
      expect(postSpy).toHaveBeenCalledOnce();
      const [url, body, config] = postSpy.mock.calls[0];
      expect(url).toContain("opencode.ai/zen/go/v1/chat/completions");
      expect(body.model).toBe("mimo-v2.5");
      expect(config.headers.Authorization).toBe("Bearer sk-test-key");

      vi.unstubAllEnvs();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node ./node_modules/vitest/vitest.mjs run tests/unit/services/mimoSensesService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement mimoSensesService**

```ts
// src/services/mimoSensesService.ts
import axios from "axios";
import { logger } from "../utils/logger";

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

class MiMoSensesService {
  isAvailable(): boolean {
    return !!OPENCODE_GO_API_KEY;
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

    const isBase64 = imageUrl.startsWith("data:");
    const imagePart = isBase64
      ? {
          type: "image_url" as const,
          image_url: { url: imageUrl },
        }
      : {
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

export const mimoSensesService = new MiMoSensesService();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node ./node_modules/vitest/vitest.mjs run tests/unit/services/mimoSensesService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/mimoSensesService.ts tests/unit/services/mimoSensesService.test.ts
git commit -m "feat: add mimoSensesService for image description via MiMo V2.5"
```

---

### Task 3: OpenCode Go Service

**Files:**
- Create: `src/services/opencodeGoService.ts`
- Create: `tests/unit/services/opencodeGoService.test.ts`

- [ ] **Step 1: Write failing tests for opencodeGoService**

```ts
// tests/unit/services/opencodeGoService.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios");
vi.mock("dotenv/config", () => ({}));

describe("OpenCodeGoService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("constructor", () => {
    it("should throw if OPENCODE_GO_API_KEY is not set", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "");
      await expect(async () => {
        await import("../../src/services/opencodeGoService");
      }).rejects.toThrow("OPENCODE_GO_API_KEY");
      vi.unstubAllEnvs();
    });
  });

  describe("buildPayload", () => {
    it("should build openai payload for openai endpoint brain", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import("../../src/services/opencodeGoService");

      const request = {
        model: "proxy/deepseek-v4-flash",
        messages: [{ role: "user" as const, content: "hello" }],
        stream: false,
      };

      const payload = opencodeGoService.buildPayload(request, "deepseek-v4-flash", true);
      expect(payload.model).toBe("deepseek-v4-flash");
      expect(payload.messages).toHaveLength(1);
      expect(payload.stream).toBe(false);
      vi.unstubAllEnvs();
    });
  });

  describe("resolveEndpointUrl", () => {
    it("should return openai endpoint for openai brain", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import("../../src/services/opencodeGoService");

      const url = opencodeGoService.resolveEndpointUrl("openai");
      expect(url).toContain("/chat/completions");
      expect(url).toContain("opencode.ai");
      vi.unstubAllEnvs();
    });

    it("should return anthropic endpoint for anthropic brain", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import("../../src/services/opencodeGoService");

      const url = opencodeGoService.resolveEndpointUrl("anthropic");
      expect(url).toContain("/messages");
      expect(url).toContain("opencode.ai");
      vi.unstubAllEnvs();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node ./node_modules/vitest/vitest.mjs run tests/unit/services/opencodeGoService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement opencodeGoService**

```ts
// src/services/opencodeGoService.ts
import axios from "axios";
import { logger } from "../utils/logger";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from "../types/openai";
import type { BrainModelEntry } from "./brainRegistry";

const OPENCODE_GO_API_KEY = process.env.OPENCODE_GO_API_KEY || "";
const OPENCODE_GO_BASE_URL =
  process.env.OPENCODE_GO_BASE_URL || "https://opencode.ai/zen/go/v1";
const OPENCODE_GO_TIMEOUT_MS = parseInt(
  process.env.OPENCODE_GO_TIMEOUT_MS || "120000",
);

if (!OPENCODE_GO_API_KEY) {
  throw new Error("OPENCODE_GO_API_KEY no configurado en .env");
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

  private truncateMessages(
    messages: ChatMessage[],
    maxContextTokens: number,
  ): ChatMessage[] {
    const estimateTokens = (text: string | null) =>
      Math.ceil((text || "").length / 3);

    const systemMessages = messages.filter((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    let systemTokens = systemMessages.reduce((sum, msg) => {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      return sum + estimateTokens(content);
    }, 0);

    if (systemTokens > maxContextTokens * 0.3) {
      systemMessages.splice(1);
      const content =
        typeof systemMessages[0]?.content === "string"
          ? systemMessages[0].content
          : JSON.stringify(systemMessages[0]?.content);
      systemTokens = estimateTokens(content);
    }

    const result = [...systemMessages];
    let currentTokens = systemTokens;
    const maxTokensForHistory = maxContextTokens - systemTokens;

    for (let i = otherMessages.length - 1; i >= 0; i--) {
      const msg = otherMessages[i];
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      const msgTokens = estimateTokens(content);

      if (currentTokens + msgTokens > maxTokensForHistory) {
        break;
      }

      result.splice(systemMessages.length, 0, msg);
      currentTokens += msgTokens;
    }

    return result;
  }

  private prepareMessages(
    messages: ChatMessage[],
    thinking: boolean,
  ): any[] {
    return messages
      .filter((msg) =>
        ["system", "user", "assistant", "tool"].includes(msg.role),
      )
      .map((msg) => {
        const prepared: any = {
          role: msg.role,
          content:
            msg.content === null
              ? null
              : typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content),
        };
        if (msg.name) prepared.name = msg.name;
        if (msg.tool_calls) prepared.tool_calls = msg.tool_calls;
        if (msg.tool_call_id) prepared.tool_call_id = msg.tool_call_id;
        if (thinking && msg.reasoning_content !== undefined) {
          prepared.reasoning_content = msg.reasoning_content;
        }
        return prepared;
      });
  }

  buildPayload(
    request: ChatCompletionRequest,
    upstreamModel: string,
    thinking: boolean,
  ): any {
    const validMessages = this.prepareMessages(request.messages, thinking);
    const truncatedMessages = this.truncateMessages(
      validMessages,
      1048576,
    );

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
    );
    const url = this.resolveEndpointUrl(brainEntry.endpoint);

    logger.info(
      `OpenCode Go: POST ${url} | model: ${brainEntry.upstream} | thinking: ${brainEntry.thinking}`,
    );

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: this.timeout,
    });

    return response.data;
  }

  async chatCompletionStream(
    request: ChatCompletionRequest,
    brainEntry: BrainModelEntry,
    onChunk: (chunk: string) => void,
    onError: (error: unknown) => void,
    onComplete: () => void,
  ): Promise<void> {
    const payload = this.buildPayload(
      request,
      brainEntry.upstream,
      brainEntry.thinking,
    );
    payload.stream = true;
    const url = this.resolveEndpointUrl(brainEntry.endpoint);

    logger.info(
      `OpenCode Go (stream): POST ${url} | model: ${brainEntry.upstream}`,
    );

    try {
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: this.timeout,
        responseType: "stream",
      });

      const stream = response.data;

      stream.on("data", (chunk: Buffer) => {
        onChunk(chunk.toString());
      });

      stream.on("end", () => {
        onComplete();
      });

      stream.on("error", (error: unknown) => {
        onError(error);
      });
    } catch (error: unknown) {
      onError(error);
    }
  }
}

export const opencodeGoService = new OpenCodeGoService();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node ./node_modules/vitest/vitest.mjs run tests/unit/services/opencodeGoService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/opencodeGoService.ts tests/unit/services/opencodeGoService.test.ts
git commit -m "feat: add opencodeGoService for all OpenCode Go brain models"
```

---

### Task 4: Update Multimodal Processor

**Files:**
- Modify: `src/middleware/multimodalProcessor.ts`
- Modify: `tests/unit/middleware/multimodalProcessor.test.ts`

- [ ] **Step 1: Read current multimodalProcessor test to understand patterns**

Run: `node ./node_modules/vitest/vitest.mjs run tests/unit/middleware/multimodalProcessor.test.ts`
Expected: PASS (existing tests)

- [ ] **Step 2: Add tests for vision-mimo strategy**

Add to `tests/unit/middleware/multimodalProcessor.test.ts`:

```ts
describe("vision-mimo strategy", () => {
  it("should route image content through mimoSensesService", async () => {
    // existing test structure — add test for when model is a proxy brain
    // and content contains images, strategy should be "vision-mimo"
  });
});
```

Note: the exact test depends on existing mock patterns in the test file. Inspect the test first and add accordingly.

- [ ] **Step 3: Modify multimodalProcessor to support vision-mimo**

In `src/middleware/multimodalProcessor.ts`:

1. Add imports at top:
```ts
import { mimoSensesService } from "../services/mimoSensesService";
import { isPassthrough, getBrainEntry } from "../services/brainRegistry";
```

2. Add `"vision-mimo"` to the strategy union type (line 21).

3. Add passthrough early-return at the top of `processMultimodalContent` (after the vision-direct check, around line 39):
```ts
if (isPassthrough(modelName || "")) {
  logger.info(`Modelo passthrough ${modelName} - sin procesamiento multimodal`);
  return {
    processedMessages: messages,
    useDeepseekDirectly: true,
    strategy: "direct",
  };
}
```

4. In the vision content processing block (lines 91-104), replace the Gemini call:
```ts
const visionDescriptions = await Promise.all(
  visionContent.map(async (content, index) => {
    logger.info(
      `Procesando imagen ${index + 1}/${visionContent.length} con MiMo V2.5...`,
    );
    try {
      return await mimoSensesService.describeImage(content.source, userContext);
    } catch (error: unknown) {
      logger.error(
        `MiMo V2.5 fallo para imagen ${index + 1}: ${getErrorMessage(error)}`,
      );
      logger.info("Fallback a Gemini...");
      return await geminiService.analyzeContent(content, userContext);
    }
  }),
);
```

5. Update strategy assignment (lines 196-203):
```ts
let strategy: "direct" | "vision" | "vision-mimo" | "local" | "mixed" | "vision-direct" = "mixed";
if (visionContent.length > 0 && localContent.length === 0) {
  strategy = "vision-mimo";
} else if (visionContent.length === 0 && localContent.length > 0) {
  strategy = "local";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node ./node_modules/vitest/vitest.mjs run tests/unit/middleware/multimodalProcessor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/middleware/multimodalProcessor.ts tests/unit/middleware/multimodalProcessor.test.ts
git commit -m "feat: add vision-mimo strategy routing images through MiMo V2.5"
```

---

### Task 5: Update /v1/models Endpoint

**Files:**
- Modify: `src/index.ts` (lines 211-295)

- [ ] **Step 1: Create opencodeGoModels utility**

```ts
// src/utils/opencodeGoModels.ts
import { BRAIN_MODELS, PASSTHROUGH_MODELS } from "../services/brainRegistry";

export function getOpenCodeModelsList(): any[] {
  const brainModels = Object.entries(BRAIN_MODELS).map(([id, entry]) => ({
    id,
    object: "model" as const,
    created: 1706745600,
    owned_by: "cortex-multimodal-proxy",
    permission: [],
    root: entry.upstream,
    parent: null,
  }));

  const passthroughModels = Array.from(PASSTHROUGH_MODELS).map((id) => ({
    id,
    object: "model" as const,
    created: 1706745600,
    owned_by: "opencode-go",
    permission: [],
    root: id,
    parent: null,
  }));

  return [...brainModels, ...passthroughModels];
}

export function getClaudeCodeModelsList(): any[] {
  return [
    {
      id: process.env.CLAUDE_HAIKU_MODEL || "mimo-v2.5",
      object: "model",
      created: 1706745600,
      owned_by: "anthropic",
    },
    {
      id: process.env.CLAUDE_SONNET_MODEL || "proxy/kimi-k2.6",
      object: "model",
      created: 1706745600,
      owned_by: "anthropic",
    },
    {
      id: process.env.CLAUDE_OPUS_MODEL || "proxy/glm-5.2",
      object: "model",
      created: 1706745600,
      owned_by: "anthropic",
    },
  ];
}
```

- [ ] **Step 2: Update /v1/models in src/index.ts**

Replace the existing `/v1/models` handler (lines 211-295) with:

```ts
import { getOpenCodeModelsList, getClaudeCodeModelsList } from "./utils/opencodeGoModels";

// In the /v1/models handler:
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
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/opencodeGoModels.ts src/index.ts
git commit -m "feat: expose 9 proxy brains and 4 passthrough models in /v1/models"
```

---

### Task 6: Update /v1/chat/completions for Proxy Models

**Files:**
- Modify: `src/index.ts` (lines 297-411)

- [ ] **Step 1: Update /v1/chat/completions handler**

Replace the existing handler to support brain routing, passthrough, and legacy:

```ts
import { getBrainEntry, isPassthrough, isKnownModel } from "./services/brainRegistry";
import { opencodeGoService } from "./services/opencodeGoService";

// In the /v1/chat/completions handler:
app.post("/v1/chat/completions", async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const request = req.body as ChatCompletionRequest;
    const model = request.model;

    logger.info(
      `POST /v1/chat/completions | model: ${model} | stream: ${request.stream || false} | tools: ${!!request.tools}`,
    );

    // Route: passthrough (natively multimodal, no proxy transformation)
    if (isPassthrough(model)) {
      logger.info(`Passthrough: ${model} (natively multimodal)`);
      const passthroughEntry: BrainModelEntry = {
        upstream: model,
        context: 1048576,
        maxOutput: 131072,
        thinking: false,
        inputPrice: 0,
        outputPrice: 0,
        endpoint: "openai",
      };

      if (request.stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        await opencodeGoService.chatCompletionStream(
          request,
          passthroughEntry,
          (chunk) => res.write(chunk),
          (error) => {
            res.write(`data: ${JSON.stringify({ error: { message: String(error), type: "proxy_error" } })}\n\n`);
            res.end();
          },
          () => {
            res.write("data: [DONE]\n\n");
            res.end();
          },
        );
      } else {
        const response = await opencodeGoService.createChatCompletion(request, passthroughEntry);
        res.json(response);
      }
      return;
    }

    // Route: proxy brain
    const brainEntry = getBrainEntry(model);
    if (brainEntry) {
      logger.info(`Brain: ${brainEntry.upstream} via ${brainEntry.endpoint}`);
      // processMultimodalContent, then forward
      const { processedMessages, useDeepseekDirectly, strategy } =
        await processMultimodalContent(request.messages, model);

      res.setHeader("X-Multimodal-Strategy", strategy);

      const processedRequest = { ...request, messages: processedMessages };

      if (request.stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        await opencodeGoService.chatCompletionStream(
          processedRequest,
          brainEntry,
          (chunk) => res.write(chunk),
          (error) => {
            res.write(`data: ${JSON.stringify({ error: { message: String(error), type: "proxy_error" } })}\n\n`);
            res.end();
          },
          () => {
            res.write("data: [DONE]\n\n");
            res.end();
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            logger.info(`OK Brain stream completado (${elapsed}s) | ${brainEntry.upstream}`);
          },
        );
      } else {
        const response = await opencodeGoService.createChatCompletion(processedRequest, brainEntry);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`OK Brain completado (${elapsed}s) | ${brainEntry.upstream}`);
        res.json(response);
      }
      return;
    }

    // Unknown model
    res.status(400).json({
      error: {
        message: `Modelo desconocido: ${model}. Modelos válidos: ${Array.from(Object.keys(BRAIN_MODELS)).join(", ")}, ${Array.from(PASSTHROUGH_MODELS).join(", ")}`,
        type: "invalid_request_error",
      },
    });
  } catch (error: unknown) {
    logger.error("Error procesando request:", error);
    const errorResponse = {
      error: { message: getErrorMessage(error) || "Error interno del proxy", type: "proxy_error" },
    };
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
    } else {
      res.status(500).json(errorResponse);
    }
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat: route proxy brain and passthrough models in /v1/chat/completions"
```

---

### Task 7: Update /v1/messages for Claude Code Mappings

**Files:**
- Modify: `src/index.ts` (lines 414-776)

- [ ] **Step 1: Replace getModelRoutingStrategy with getClaudeModelMapping**

Remove the existing `getModelRoutingStrategy` function (line 71-73) and replace with:

```ts
function getClaudeModelMapping(model: string): {
  internalModel: string;
  strategy: "passthrough" | "proxy-brain";
} {
  const haikuModel = process.env.CLAUDE_HAIKU_MODEL || "mimo-v2.5";
  const sonnetModel = process.env.CLAUDE_SONNET_MODEL || "proxy/kimi-k2.6";
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
```

- [ ] **Step 2: Update /v1/messages handler routing logic**

The handler currently has two paths: `vision-direct` (haiku→Gemini) and default (sonnet/opus→DeepSeek). Replace both:

**Passthrough path** (haiku→mimo-v2.5):
- Call `anthropicAdapter.anthropicToInternal()` to convert Anthropic→OpenAI format
- Forward to `opencodeGoService.createChatCompletion()` with passthrough entry
- Convert response back with `anthropicAdapter.internalToAnthropic()`
- Same streaming logic as existing handler

**Proxy-brain path** (sonnet→proxy/kimi-k2.6, opus→proxy/glm-5.2):
- Call `anthropicAdapter.anthropicToInternal()` to convert Anthropic→OpenAI format
- Call `processMultimodalContent()` to apply MiMo senses for images
- Forward to `opencodeGoService.createChatCompletion()` with brain entry
- Convert response back with `anthropicAdapter.internalToAnthropic()`

Key: the `geminiService.generateDirectResponse()` call for haiku (line 555) is replaced by `opencodeGoService.createChatCompletion()` with the passthrough model.

- [ ] **Step 3: Run lint and typecheck**

Run: `node ./node_modules/typescript/bin/tsc && node ./node_modules/eslint/bin/eslint.js src --ext .ts`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: update Claude Code mappings for cortex v3 brains"
```

---

### Task 8: Update .env.example and Configuration

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Update .env.example**

Replace contents with:

```bash
# OpenCode Go (replaces DEEPSEEK_API_KEY)
OPENCODE_GO_API_KEY=sk-your-opencode-go-key
# OPENCODE_GO_BASE_URL=https://opencode.ai/zen/go/v1
# OPENCODE_GO_TIMEOUT_MS=120000

# MiMo V2.5 Senses (for image description)
SENSES_MODEL=mimo-v2.5
# SENSES_IMAGE_PROMPT=...custom prompt...
# SENSES_TIMEOUT_MS=120000

# Gemini (fallback for audio/video/PDF — optional)
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-2.5-flash

# Claude Code model aliases
CLAUDE_HAIKU_MODEL=mimo-v2.5
CLAUDE_SONNET_MODEL=proxy/kimi-k2.6
CLAUDE_OPUS_MODEL=proxy/glm-5.2

# Cache
CACHE_ENABLED=true
CACHE_DIR=./cache
CACHE_TTL_DAYS=7
CACHE_MAX_ENTRIES=1000

# Limits
MAX_FILE_SIZE_MB=50
MAX_IMAGES_PER_REQUEST=999

# PDFs
PDF_LOCAL_PROCESSING=true
PDF_LOCAL_MAX_SIZE_MB=1

# Server
PORT=7777
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "feat: update .env.example for cortex-multimodal-proxy v3"
```

---

### Task 9: Remove DeepSeek Service and Clean Up

**Files:**
- Delete: `src/services/deepseekService.ts`
- Modify: `src/index.ts` (remove deepseekService import)
- Modify: `tests/unit/services/deepseekService.test.ts` → update or delete

- [ ] **Step 1: Verify deepseekService is no longer imported**

Search for `deepseekService` in all source files. If `src/index.ts` still imports it, remove the import. The service is fully replaced by `opencodeGoService`.

- [ ] **Step 2: Delete deepseekService.ts**

```bash
rm src/services/deepseekService.ts
```

- [ ] **Step 3: Update or delete deepseekService test**

If tests only test DeepSeek-specific behavior → delete. If they test reusable patterns → refactor to test opencodeGoService.

```bash
# Option A: delete
rm tests/unit/services/deepseekService.test.ts

# Option B: rename and adapt if tests are still useful
mv tests/unit/services/deepseekService.test.ts tests/unit/services/opencodeGoService.test.ts
```

- [ ] **Step 4: Run all unit tests**

Run: `node ./node_modules/vitest/vitest.mjs run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove deepseekService, replaced by opencodeGoService"
```

---

### Task 10: Rename Project

**Files:**
- Modify: `package.json`
- Modify: `src/index.ts` (health endpoint, log messages)
- Modify: `Dockerfile` (if present)
- Modify: `docker-compose.yml` (if present)

- [ ] **Step 1: Update package.json**

Change:
- `name`: `"deepseek-multimodal-proxy"` → `"cortex-multimodal-proxy"`
- `description`: update to reflect v3 architecture
- `version`: bump to `"3.0.0"`
- `repository.url`: `deepseek-multimodal-proxy.git` → `cortex-multimodal-proxy.git`
- `bugs.url`: update
- `homepage`: update

- [ ] **Step 2: Update /health endpoint in src/index.ts**

Change `service: "deepseek-multimodal-proxy"` → `service: "cortex-multimodal-proxy"`.

- [ ] **Step 3: Update init() log messages in src/index.ts**

Change references to "DeepSeek Multimodal Proxy v2" → "Cortex Multimodal Proxy v3" and "Cortex Sensorial v2" → "Cortex Sensorial v3".

- [ ] **Step 4: Update Dockerfile and docker-compose.yml**

If they reference the old image name, update to `cortex-multimodal-proxy`.

- [ ] **Step 5: Build to verify**

Run: `node ./node_modules/typescript/bin/tsc`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add package.json src/index.ts Dockerfile docker-compose.yml
git commit -m "feat: rename project to cortex-multimodal-proxy v3.0.0"
```

---

### Task 11: Update Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Create: `MODELS.md` (optional, detailed model table)

- [ ] **Step 1: Update CLAUDE.md**

Key changes:
- Architecture section: "DeepSeek = brain, Gemini 2.5 Flash = senses" → "Cortex Sensorial v3: 9 brains via OpenCode Go + MiMo V2.5 senses"
- Remove: "No third-party vision alternatives without explicit approval (Qwen, MiniMax were evaluated and reverted)"
- Models section: update to list 9 brains + 4 passthrough
- Services section: replace deepseekService references with opencodeGoService, mimoSensesService, brainRegistry
- Env section: replace DEEPSEEK_API_KEY with OPENCODE_GO_API_KEY
- Update pricing table

- [ ] **Step 2: Update README.md**

Replace entire README to reflect:
- Title: "Cortex Multimodal Proxy (OpenCode Go Edition)"
- New architecture diagram
- Updated install instructions (OPENCODE_GO_API_KEY instead of DEEPSEEK_API_KEY)
- Updated model table
- Updated pricing table
- Updated /v1/models response examples

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update README and CLAUDE.md for cortex-multimodal-proxy v3"
```

---

### Task 12: Update Integration Tests

**Files:**
- Modify: `test/test-master.js`

- [ ] **Step 1: Update test-master.js model references**

Replace all `deepseek-multimodal-flash` and `deepseek-multimodal-pro` with `proxy/deepseek-v4-flash` and `proxy/deepseek-v4-pro`.

Add smoke tests for other brains:
- `proxy/kimi-k2.6` with text
- `proxy/glm-5.2` with text
- `mimo-v2.5` with image (passthrough)

- [ ] **Step 2: Commit**

```bash
git add test/test-master.js
git commit -m "test: update integration tests for cortex-multimodal-proxy v3"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Build**

Run: `node ./node_modules/typescript/bin/tsc`
Expected: no errors

- [ ] **Step 2: Lint**

Run: `node ./node_modules/eslint/bin/eslint.js src --ext .ts`
Expected: clean (fix any warnings)

- [ ] **Step 3: Unit tests**

Run: `node ./node_modules/vitest/vitest.mjs run`
Expected: all tests PASS

- [ ] **Step 4: Review git diff**

Run: `git diff main --stat`
Expected: all changes are accounted for in the plan

- [ ] **Step 5: Final commit if needed**

```bash
git add -A
git commit -m "chore: final cleanup for cortex-multimodal-proxy v3.0.0"
```
