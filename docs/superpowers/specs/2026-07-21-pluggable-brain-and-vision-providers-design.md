# Spec: Pluggable Brain and Vision Providers (env-switched)

**Date**: 2026-07-21
**Status**: Draft (pending user review)
**Scope**: Generalize the Cortex Multimodal Proxy so the brain caller and the vision caller are pluggable interfaces selected at startup by `.env` keys, enabling a user to deploy the same public repo with either (a) the public OpenCode Go + MiMo V2.5 stack or (b) a personal DeepSeek + MiniMax-M3 stack using their own API keys. Zero behavior change for the public path.

---

## Goal

Allow the same `cortex-multimodal-proxy` binary to run under four `BRAIN_MODE` values — `opencode`, `deepseek`, `auto`, or `hybrid` — selected at startup by env vars, with zero behavior change for the public path (no `BRAIN_MODE` set + only `OPENCODE_GO_API_KEY` present → byte-identical to v3.0.0) and no model-ID change for OpenCode/Claude Code clients in any mode.

### Success Criteria

1. With `BRAIN_MODE` unset (or set to `opencode`) and `OPENCODE_GO_API_KEY` set, behavior is byte-identical to v3.0.0 (same 4 brains, same MiMo V2.5 vision, same Gemini fallback).
2. With `BRAIN_MODE=deepseek` and `DEEPSEEK_API_KEY` (+optional `MINIMAX_API_KEY`) set, `proxy/deepseek-v4-pro` and `proxy/deepseek-v4-flash` resolve to the user's DeepSeek account; image descriptions use MiniMax-M3 (when `MINIMAX_API_KEY` set) or fall back to Gemini on vision failure.
3. With `BRAIN_MODE=hybrid`, both providers coexist: the 4 OpenCode Go brains register under their standard `proxy/*` IDs; the user's DeepSeek V4 Pro/Flash register under new `proxy/local-deepseek-v4-pro` and `proxy/local-deepseek-v4-flash` IDs. Vision: `MINIMAX_API_KEY` set → MiniMax-M3 primary, MiMo V2.5 unavailable (since `OPENCODE_GO_API_KEY` is the path that exposed MiMo); if `MINIMAX_API_KEY` not set → MiMo V2.5.
4. With `BRAIN_MODE=auto`: if `DEEPSEEK_API_KEY` present → `deepseek` behavior (with warning if `OPENCODE_GO_API_KEY` also set); else if `OPENCODE_GO_API_KEY` present → `opencode` behavior; else fatal.
5. With `BRAIN_MODE` set to an explicit provider (`opencode` or `deepseek`) but the required key missing, startup fails fast with a clear error message naming the missing key.
6. `opencode.json` and all client-side model IDs are unchanged. **In `hybrid` mode, two new IDs are added** (`proxy/local-deepseek-v4-pro`, `proxy/local-deepseek-v4-flash`); existing IDs still work.
7. `npm run build`, `npm run test:unit`, and `npm run lint` all pass with no regressions.
8. Adding a third brain provider (e.g. `ClaudeDirectBrainProvider` later) requires exactly one new class file plus one line in `providerSelector.ts`.

---

## Background

### Current State (v3.0.0)

- `opencodeGoService.ts` (`src/services/opencodeGoService.ts:1-435`) is a monolith that hardcodes the OpenCode Go base URL, its API key, the auth-header builder, the Anthropic↔OpenAI payload conversion, the streaming SSE conversion, and retry. It exports a singleton used everywhere.
- `mimoSensesService.ts` (`src/services/mimoSensesService.ts:1-88`) is a singleton that hardcodes `SENSES_MODEL=mimo-v2.5`, OpenCode Go base URL + key, and a description prompt. It exposes `describeImage(imageUrl, userContext)`.
- `brainRegistry.ts` (`src/services/brainRegistry.ts:12-53`) hardcodes `BRAIN_MODELS` with the 4 OpenCode Go brains. There is no runtime extension path.
- `multimodalProcessor.ts` (`src/middleware/multimodalProcessor.ts:42-46`) imports `mimoSensesService` as a singleton and uses `mimoSensesService.isAvailable()` to decide whether to route images through MiMo V2.5.
- `index.ts` imports `opencodeGoService` as a singleton and calls `createChatCompletion` / `chatCompletionStream` directly.

### User Need

The repo is public and must remain compatible with OpenCode Go (zero breaking change). The maintainer also wants to deploy the same proxy locally using their own DeepSeek account for the brain (`deepseek-v4-pro` or `deepseek-v4-flash`, thinking max) and their own MiniMax account for vision (`MiniMax-M3`, no thinking). For their personal deploy, `proxy/deepseek-v4-pro` should resolve to **their** DeepSeek account, not OpenCode Go's. Public deploys must continue to work for other users without modification.

### Externally Confirmed Facts (researched 2026-07-21)

#### DeepSeek V4 Pro and V4 Flash

- **Base URL** (OpenAI-compatible): `https://api.deepseek.com` — confirmed at `api-docs.deepseek.com`.
- **Model IDs**: `deepseek-v4-pro`, `deepseek-v4-flash` (the legacy aliases `deepseek-chat` / `deepseek-reasoner` deprecate on 2026-07-24).
- **Auth**: `Authorization: Bearer $DEEPSEEK_API_KEY`.
- **Thinking**: `thinking: { "type": "enabled" }` (OpenAI-style extended param). V4 Pro supports three reasoning modes (`non-think`, `think high`, `think max`); `think max` is the default this proxy uses.
- **Context**: 1,048,576 (1M). **Max output**: 384,000.
- **Pricing** (current, after the June 2026 price cut — `deepseek.ai/pricing`): V4 Pro $0.435 in / $0.87 out per 1M tokens; V4 Flash $0.14 in / $0.28 out per 1M. Cached input $0.0036/$0.0028.
  - **Note**: README and `CLAUDE.md` currently state V4 Pro at $1.74/$3.48. This is the pre-cut price. The combined pricing table will be updated as part of this work.
- **Anthropic-compatible** endpoint also available at `https://api.deepseek.com/anthropic/v1/messages`. Not used in this scope.

#### MiniMax M3

- **Base URL** (Anthropic-compatible): `https://api.minimax.io/anthropic`. Also OpenAI-compatible at `https://api.minimax.io/v1` (out of scope; Anthropic-format picked because video/image blocks map cleanly to existing multimodal detection).
- **Model ID**: `MiniMax-M3`.
- **Auth**: `Authorization: Bearer $MINIMAX_API_KEY` + `anthropic-version: 2023-06-01`.
- **Thinking**: omit the `thinking` block to disable; pass `thinking: { "type": "adaptive" }` to enable. This spec uses **thinking disabled** (matches user requirement).
- **Modalities**: text, image, video (no audio). M3 is a VLM with native vision understanding via `type:"image"` content blocks (`source` is `{type:"url",url}` or base64).
- **Context** (real): 1M. **Context metadata from `/anthropic` endpoint**: reports 200K (known bug, see `MiniMax-AI/MiniMax-M2.7#46`). For this proxy, M3 is the **senses provider** (single image + prompt), not the brain. Description payloads are far smaller than 200K, so the 200K reported cap is acceptable for the senses use-case.
- **Pricing**: $0.30/$1.20 per 1M at ≤512K, $0.60/$1.20 at >512K (Standard tier). For image descriptions the input is always small.

---

## Design

### 1. Architecture

```
Current (singletons):                    Target (provider interface + factory):
─────────────────────                    ────────────────────────────────────
opencodeGoService  ─┐                   BrainProvider interface ──┬── OpenCodeGoBrainProvider (BRAIN_MODE=opencode|hybrid)
mimoSensesService  ─┤                                            ├── DeepSeekBrainProvider   (BRAIN_MODE=deepseek|hybrid)
geminiService      ─┤                   VisionProvider interface ─┼── MimoSensesVisionProvider (BRAIN_MODE=opencode|hybrid sin MINIMAX_API_KEY)
pdfProcessor       ─┤                                            ├── MiniMaxM3VisionProvider (BRAIN_MODE=deepseek|hybrid con MINIMAX_API_KEY)
multimodalProcessor ┘                                            └── geminiService (always — fallback)
                          + providerSelector.ts  (env-driven factory; resolves BRAIN_MODE;
                                                   instantiates providers; builds dynamic BRAIN_MODELS at startup)
                          + anthropicPayloadConverter.ts (extracted helper)
```

Changes are **additive and opt-in**. Public mode paths are byte-identical to v3.0.0 (only the file names of two services change).

### 2. Components

#### New Files

| File | Responsibility |
|---|---|
| `src/services/brainProvider.ts` | `BrainProvider` TypeScript interface (6 methods: `name`, `buildPayload`, `resolveEndpointUrl`, `buildAuthHeaders`, `createChatCompletion`, `chatCompletionStream`). |
| `src/services/visionProvider.ts` | `VisionProvider` TypeScript interface (`name`, `isAvailable`, `supportsContentType`, `describeImage`). |
| `src/services/opencodeGoBrainProvider.ts` | `OpenCodeGoBrainProvider` — wrap of the current `opencodeGoService` logic. Same wire behavior, different name to reflect the role. |
| `src/services/deepseekBrainProvider.ts` | `DeepSeekBrainProvider` — OpenAI-compatible at `https://api.deepseek.com` (default, overridable). Key from `DEEPSEEK_API_KEY`. Thinking max for V4 Pro/Flash (relies on `BRAIN_MODELS_BASE[*].thinking = true`). Retries same curve as OpenCodeGo (2s/4s on 502/503/429). |
| `src/services/mimoSensesVisionProvider.ts` | `MimoSensesVisionProvider` — wrap of the current `mimoSensesService` logic. |
| `src/services/minimaxM3VisionProvider.ts` | `MiniMaxM3VisionProvider` — Anthropic-format POST to `${MINIMAX_BASE_URL}/v1/messages`. Key from `MINIMAX_API_KEY`. `model = SENSES_MODEL` (default `MiniMax-M3`). Image content via `{type:"image", source:{type:"url", url:imageUrl}}`. **No `thinking` block** (disabled by design). Same retry curve. |
| `src/services/anthropicPayloadConverter.ts` | Helper extracted from the current `openAIToAnthropicPayload` (`opencodeGoService.ts:25-118`). Reusable by any Anthropic-format brain provider (future-proofing, not required by this scope). |
| `src/services/providerSelector.ts` | Factory: reads `BRAIN_MODE` and keys, resolves mode (`opencode` / `deepseek` / `hybrid`), picks primary + (in `hybrid`) optional secondary providers, instantiates the active `BrainProvider` and `VisionProvider`, populates `BRAIN_MODELS` via `registerBrainEntry()`. Exports `getActiveBrainProvider()`, `getActiveVisionProvider()`, `getBrainModels()`, and `getActiveProviderInfo()` (for `/health` and `/v1/models`). |

#### Renamed Files (Pure Rename, Same Code Inside)

| Old | New |
|---|---|
| `src/services/opencodeGoService.ts` | `src/services/opencodeGoBrainProvider.ts` |
| `src/services/mimoSensesService.ts` | `src/services/mimoSensesVisionProvider.ts` |

The old files are deleted after the rename — there is no backward-compat shim because they are internal modules (no external consumers outside `src/index.ts` and `src/middleware/multimodalProcessor.ts`, which are updated in the same change).

#### Modified Files

| File | Change |
|---|---|
| `src/services/brainRegistry.ts` | Rename `BRAIN_MODELS` export to `BRAIN_MODELS_BASE`. Add `registerBrainEntry(id: string, entry: BrainModelEntry): void` and `getBrainModels(): Record<string, BrainModelEntry>` (returns merged base + runtime entries). Existing `getBrainEntry` / `isPassthrough` / `parseProxyModelId` / `isKnownModel` continue to work unchanged via the merged view. |
| `src/middleware/multimodalProcessor.ts` | `processMultimodalContent()` accepts an optional `visionProvider: VisionProvider` parameter; falls back to `getActiveVisionProvider()` (lazy import of `providerSelector.ts` to avoid module-init cycle). Routing dispatch changes from "use MiMo for all images" to: `visionProvider.supportsContentType("image"|"video") ? visionProvider : geminiService`. Audio always routes to Gemini (no current provider supports it). PDF routing unchanged (local `pdfProcessor` → Gemini fallback). |
| `src/index.ts` | Imports `providerSelector.ts` instead of the old service singletons. Uses `getActiveBrainProvider()` to satisfy `createChatCompletion` and `chatCompletionStream` calls. Passes active vision provider to `processMultimodalContent()`. `/v1/models` and `/health` reflect active provider info. |
| `.env.example` | Document `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `MINIMAX_API_KEY`, `MINIMAX_BASE_URL`, and the updated `SENSES_MODEL` semantics. |
| `README.md`, `CLAUDE.md`, `MODELS.md` | Document the public/local switch, the new env vars, and update DeepSeek pricing to post-June-2026 values ($0.435/$0.87). |

#### Unchanged Files

`geminiService.ts`, `pdfProcessor.ts`, `messageTransforms.ts`, `anthropicStreamConverter.ts`, `anthropicAdapter.ts`, `opencode.json`, `types/openai.ts`, `types/anthropic.ts`, `utils/*`.

### 3. `BrainProvider` Interface

```typescript
// src/services/brainProvider.ts
// Canonical declaration of BrainModelEntry; brainRegistry.ts re-exports it
// for backwards-compat with existing `from "./brainRegistry"` imports.
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
  readonly name: string;        // "opencode-go" | "deepseek-direct" | future
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

  // Optional: only needed by providers that may serve Anthropic-format models.
  convertAnthropicChunkToOpenAI?(
    parsed: unknown,
    brainEntry: BrainModelEntry,
    upstreamMessageId?: string,
  ): Record<string, unknown> | null;
}
```

`DeepSeekBrainProvider` implements all six required methods and does not need `convertAnthropicChunkToOpenAI` (V4 Pro/Flash are OpenAI-format only).

`OpenCodeGoBrainProvider` implements all six plus `convertAnthropicChunkToOpenAI` (used by any future Anthropic-format model entry in `BRAIN_MODELS_BASE`, e.g. `qwen3.7-max`).

### 4. `VisionProvider` Interface

```typescript
// src/services/visionProvider.ts
export type VisionContentType = "image" | "video" | "audio";

export interface VisionProvider {
  readonly name: string;
  isAvailable(): boolean;
  supportsContentType(type: VisionContentType): boolean;
  describeImage(imageUrl: string, userContext: string): Promise<string>;
}
```

`MiniMaxM3VisionProvider.supportsContentType("image" | "video")` returns `true`; `"audio"` returns `false`.
`MimoSensesVisionProvider.supportsContentType("image")` returns `true`; `"video"` and `"audio"` return `false` (current behavior).
`GeminiService` does not implement `VisionProvider` — it remains a legacy fallback called directly from `multimodalProcessor.ts` when the active `VisionProvider` does not support a content type, or when the active provider throws.

### 5. `providerSelector` Behavior

The selector reads a single env var: `BRAIN_MODE` (default: `auto`). Allowed values:

- `opencode` — only OpenCode Go brains, MiMo V2.5 vision. Requires `OPENCODE_GO_API_KEY`.
- `deepseek` — only DeepSeek V4 Pro/Flash (local IDs), MiniMax M3 vision (if `MINIMAX_API_KEY` set). Requires `DEEPSEEK_API_KEY`.
- `auto` — picks `deepseek` if `DEEPSEEK_API_KEY` is set (warning if `OPENCODE_GO_API_KEY` also set); else picks `opencode` if `OPENCODE_GO_API_KEY` is set; else fatal.
- `hybrid` — both providers loaded simultaneously. The standard `proxy/glm-5.2`, `proxy/deepseek-v4-pro` (OpenCode version), `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro` are registered from `BRAIN_MODELS_BASE`. **Two new model IDs are added** that route to the user's local DeepSeek: `proxy/local-deepseek-v4-pro` and `proxy/local-deepseek-v4-flash`. The naming convention `<provider-kind>-<original-id>` makes the source unambiguous in client configs. Vision: `MINIMAX_API_KEY` set → MiniMax M3 primary (it handles both OpenCode and DeepSeek brains); else MiMo V2.5.

#### Resolution Algorithm (executed once at module load)

```typescript
function resolveMode(): "opencode" | "deepseek" | "hybrid" {
  const raw = (process.env.BRAIN_MODE ?? "auto").toLowerCase().trim();

  if (raw === "opencode") {
    if (!process.env.OPENCODE_GO_API_KEY) {
      throw new Error("BRAIN_MODE=opencode requiere OPENCODE_GO_API_KEY en .env");
    }
    return "opencode";
  }

  if (raw === "deepseek") {
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error("BRAIN_MODE=deepseek requiere DEEPSEEK_API_KEY en .env");
    }
    return "deepseek";
  }

  if (raw === "hybrid") {
    if (!process.env.OPENCODE_GO_API_KEY && !process.env.DEEPSEEK_API_KEY) {
      throw new Error("BRAIN_MODE=hybrid requiere OPENCODE_GO_API_KEY o DEEPSEEK_API_KEY");
    }
    return "hybrid";
  }

  // raw === "auto" (or any unrecognized value treated as auto)
  if (process.env.DEEPSEEK_API_KEY) {
    if (process.env.OPENCODE_GO_API_KEY) {
      logger.warn("OPENCODE_GO_API_KEY presente pero ignorado porque DEEPSEEK_API_KEY ganó (BRAIN_MODE=auto). Set BRAIN_MODE=hybrid para usar ambos.");
    }
    return "deepseek";
  }
  if (process.env.OPENCODE_GO_API_KEY) {
    return "opencode";
  }
  throw new Error(
    "No hay API key de brain configurada. Set OPENCODE_GO_API_KEY (modo opencode), DEEPSEEK_API_KEY (modo deepseek), o ambas (BRAIN_MODE=hybrid).",
  );
}
```

#### Vision Resolution

After mode resolution:

- **`opencode`**: vision = `MimoSensesVisionProvider` (requires `OPENCODE_GO_API_KEY`, always present).
- **`deepseek`**: vision = `MiniMaxM3VisionProvider` if `MINIMAX_API_KEY` set; else log warning, vision disabled (multimodal content requests will fail with a clear error).
- **`hybrid`**: vision = `MiniMaxM3VisionProvider` if `MINIMAX_API_KEY` set; else `MimoSensesVisionProvider`.
- **`auto`**: follows the resolved mode above.

#### Brain Registry Construction

##### `opencode` Mode

`BRAIN_MODELS_BASE` is the only source — no `registerBrainEntry()` calls, behavior matches v3.0.0 byte-for-byte. Active brains: `proxy/glm-5.2`, `proxy/deepseek-v4-pro` (OpenCode flavor), `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro`.

##### `deepseek` Mode

`providerSelector` registers two new entries (original `BRAIN_MODELS_BASE` entries are not registered in this mode):

```typescript
const entries: Record<string, BrainModelEntry> = {
  "proxy/deepseek-v4-pro": {
    upstream: "deepseek-v4-pro",
    context: 1_048_576,
    maxOutput: 384_000,
    thinking: true,
    inputPrice: 0.435,    // updated post-June-2026 price (was 1.74)
    outputPrice: 0.87,     // updated post-June-2026 price (was 3.48)
    endpoint: "openai",
    multimodal: false,
  },
  "proxy/deepseek-v4-flash": {
    upstream: "deepseek-v4-flash",
    context: 1_048_576,
    maxOutput: 384_000,
    thinking: true,
    inputPrice: 0.14,
    outputPrice: 0.28,
    endpoint: "openai",
    multimodal: false,
  },
};
```

The `proxy/deepseek-v4-pro` ID in `deepseek` mode points to the **user's** DeepSeek account (the OpenCode Go version is not exposed). This is the same model ID the user's `opencode.json` already uses.

##### `hybrid` Mode

`BRAIN_MODELS_BASE` is loaded as-is (4 OpenCode Go brains under standard IDs). The selector additionally calls `registerBrainEntry()` for two new entries with the `local-` prefix:

```typescript
const localEntries: Record<string, BrainModelEntry> = {
  "proxy/local-deepseek-v4-pro":   { /* same shape as deepseek-mode entry, upstream: "deepseek-v4-pro" */ },
  "proxy/local-deepseek-v4-flash": { /* same shape, upstream: "deepseek-v4-flash" */ },
};
```

Both the `proxy/deepseek-v4-pro` (OpenCode Go flavor) and `proxy/local-deepseek-v4-pro` (user's DeepSeek) coexist, so the client can pick which to target by ID. `parseProxyModelId("proxy/deepseek-v4-pro")` still returns `"deepseek-v4-pro"`; `parseProxyModelId("proxy/local-deepseek-v4-pro")` returns `"deepseek-v4-pro"` too (the `local-` prefix is stripped only for the upstream call — the public brain registry still treats the ID as the upstream model name).

**Note on the `local-` prefix**: `parseProxyModelId` currently strips the `proxy/` prefix. To distinguish `proxy/local-deepseek-v4-pro` from `proxy/deepseek-v4-pro` upstream-bound, the selector strips `proxy/local-` for the upstream name. Implementation: `parseLocalProxyModelId()` added to `brainRegistry.ts` that returns `"deepseek-v4-pro"` for both `proxy/local-deepseek-v4-pro` and `proxy/local-deepseek-v4-flash`. Standard `parseProxyModelId` is unchanged for backwards-compat.

### 6. Data Flow

#### `BRAIN_MODE=opencode` (Default)

1. Client → `POST /v1/chat/completions` with `model: "proxy/deepseek-v4-pro"`.
2. `index.ts` resolves `activeBrainProvider = OpenCodeGoBrainProvider` and `modelEntry = BRAIN_MODELS_BASE["proxy/deepseek-v4-pro"]`.
3. `multimodalProcessor` receives `activeVisionProvider = MimoSensesVisionProvider`.
4. If images present → `mimoSensesService.describeImage()`. If audio/video/PDF → `geminiService.analyzeContent()` or `pdfProcessor.analyzePDF()` per existing rules.
5. `OpenCodeGoBrainProvider.createChatCompletion()` → POST to `https://opencode.ai/zen/go/v1/chat/completions` with `model: "deepseek-v4-pro"`.
6. Stream or JSON response → back to client.

**Identical to v3.0.0.** Verified by the existing `opencodeGoService.test.ts` tests, renamed to `opencodeGoBrainProvider.test.ts` without behavioral changes.

#### `BRAIN_MODE=deepseek`

1. Client → `POST /v1/chat/completions` with `model: "proxy/deepseek-v4-pro"` (same string; clients don't change).
2. `index.ts` resolves `activeBrainProvider = DeepSeekBrainProvider` and `modelEntry = getBrainModels()["proxy/deepseek-v4-pro"]` (registered by selector at startup).
3. `multimodalProcessor` receives `activeVisionProvider = MiniMaxM3VisionProvider` (if `MINIMAX_API_KEY` set).
4. If images or videos present → `minimaxM3VisionProvider.describeImage()` (uses Anthropic-format with `type:"image"` block, no `thinking` block).
5. If vision provider throws → fallback to `geminiService.analyzeContent()`.
6. Audio (always) → `geminiService.analyzeContent()` (M3 doesn't support audio).
7. PDFs → local `pdfProcessor.analyzePDF()` first; fallback to Gemini on failure.
8. `DeepSeekBrainProvider.createChatCompletion()` → POST to `https://api.deepseek.com/v1/chat/completions` with `model: "deepseek-v4-pro"`, `thinking: { type: "enabled" }`, `Authorization: Bearer $DEEPSEEK_API_KEY`.
9. Stream or JSON response → back to client.

The OpenCode JSON client config never changes. The user just edits `.env` (set `BRAIN_MODE=deepseek` + `DEEPSEEK_API_KEY` + optional `MINIMAX_API_KEY`) and restarts.

#### `BRAIN_MODE=hybrid`

Both providers are live simultaneously. The brain registry contains 6 entries:

- `proxy/glm-5.2`, `proxy/deepseek-v4-pro` (OpenCode Go flavor), `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro` — served by `OpenCodeGoBrainProvider`.
- `proxy/local-deepseek-v4-pro`, `proxy/local-deepseek-v4-flash` — served by `DeepSeekBrainProvider`.

Routing per request:

1. Client → `POST /v1/chat/completions` with `model: "proxy/local-deepseek-v4-pro"` (or any of the 6 IDs).
2. `index.ts` looks up `modelEntry` in the merged `getBrainModels()` view. The entry's `endpoint` discriminator decides nothing about which provider — only `index.ts` needs to call `getActiveBrainProvider()` for the right flavor. Implementation: the brain registry stores a `provider` discriminator per entry (e.g. `"opencode-go"` or `"deepseek-direct"`), set by whichever selector call registered it. `index.ts` uses that discriminator to pick the right provider instance.
3. `multimodalProcessor` receives `activeVisionProvider` (M3 if `MINIMAX_API_KEY` set, else MiMo). Senses provider serves **both** flavors' requests.
4. Per-entry brain call routes to whichever provider the entry was registered with.
5. Stream/no-stream per the chosen provider's implementation.

Vision provides multimodal coverage for both OpenCode Go brains and the user's local DeepSeek brains using the single active `VisionProvider`. Both flavors of `proxy/deepseek-v4-pro` (the OpenCode Go one and the local-prefix one) coexist; clients pick by ID. `parseLocalProxyModelId("proxy/local-deepseek-v4-pro")` returns `"deepseek-v4-pro"` for the upstream call.

#### `BRAIN_MODE=auto`

Behaves exactly like `deepseek` (with warning if `OPENCODE_GO_API_KEY` also present) or `opencode` (if only `OPENCODE_GO_API_KEY` present), per the resolution algorithm.

### 7. Configuration (`.env.example`)

```bash
# ──── MODO DE BRAIN (REQUIRED para elegir provider) ────────────────
# opencode → solo brains OpenCode Go + MiMo V2.5 vision. Default si no se setea.
# deepseek → solo brains DeepSeek (tu cuenta) + MiniMax M3 vision.
# hybrid   → ambos providers activos; DeepSeek bajo IDs proxy/local-*.
# auto     → elige opencode o deepseek segun que keys esten presentes.
#            Si DEEPSEEK_API_KEY esta presente, gana deepseek (con warning si
#            OPENCODE_GO_API_KEY tambien esta). Si no, opencode. Si ninguna,
#            fatal al startup.
BRAIN_MODE=auto                                   # default; permitidos: opencode|deepseek|auto|hybrid

# ──── OPENCODE GO (requerido para BRAIN_MODE=opencode o hybrid) ────
OPENCODE_GO_API_KEY=sk-your-opencode-go-key
OPENCODE_GO_BASE_URL=https://opencode.ai/zen/go/v1

# ──── DEEPSEEK (requerido para BRAIN_MODE=deepseek o hybrid) ──────
# Cuando BRAIN_MODE=deepseek, las entradas proxy/deepseek-v4-pro y
# proxy/deepseek-v4-flash se registran apuntando a tu cuenta DeepSeek.
# Cuando BRAIN_MODE=hybrid, se registran bajo IDs nuevos:
#   proxy/local-deepseek-v4-pro   (upstream: deepseek-v4-pro)
#   proxy/local-deepseek-v4-flash (upstream: deepseek-v4-flash)
DEEPSEEK_API_KEY=sk-your-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com        # default

# ──── MINIMAX M3 VISION (opcional, primario si esta presente) ──────
# Si esta presente, se usa MiniMax M3 como vision primario en deepseek y
# hybrid modes. Si no, se usa MiMo V2.5 (solo disponible con OPENCODE_GO_API_KEY)
# en opencode/hybrid modes, o vision queda deshabilitado en deepseek mode.
MINIMAX_API_KEY=your-minimax-key
MINIMAX_BASE_URL=https://api.minimax.io/anthropic # default
SENSES_MODEL=MiniMax-M3                           # default en modos deepseek/hybrid si MINIMAX_API_KEY set

# ──── GEMINI (siempre opcional; fallback para audio, PDF, vision fails) ───
GEMINI_API_KEY=tu_api_key_de_google
GEMINI_MODEL=gemini-2.5-flash

# ──── CLAUDE CODE MAPPINGS (funcionan en todos los modos) ────────
# En hybrid mode, sonnet/opus pueden apuntar al flavor OpenCode Go (default)
# o al flavor local (override via estas envs):
CLAUDE_HAIKU_MODEL=mimo-v2.5
CLAUDE_SONNET_MODEL=proxy/deepseek-v4-pro          # en deepseek mode es tu DeepSeek; en opencode/hybrid es OpenCode Go's
CLAUDE_OPUS_MODEL=proxy/glm-5.2

# ──── CACHE / LIMITS (unchanged) ───
CACHE_ENABLED=true
CACHE_DIR=./cache
CACHE_TTL_DAYS=7
CACHE_MAX_ENTRIES=1000
MAX_FILE_SIZE_MB=50
MAX_IMAGES_PER_REQUEST=999
PDF_LOCAL_PROCESSING=true
PDF_LOCAL_MAX_SIZE_MB=1
PORT=7777
LOG_LEVEL=info
```

### 8. Error Handling

- **Retry curve**: identical to current (`maxRetries=3`, `baseDelay=2000ms`, retry only on 502/503/429, honor `retry-after` header). Applied uniformly to every `BrainProvider` and the new vision providers.
- **Vision fallback**: `multimodalProcessor` catches errors from `visionProvider.describeImage()` and tries `geminiService.analyzeContent()`. If Gemini also fails, the error propagates (existing behavior).
- **Audio content**: dispatched directly to Gemini (skipping the active vision provider) since neither current implementation supports it. This is an additive optimization — today audio also went through the vision pipeline (MiMo had no audio support either); the net behavior is the same.
- **Missing required env at startup**: throws a clear, human-readable error from `providerSelector.resolveMode()` at module-load time, naming the missing key and the offending mode (e.g. `"BRAIN_MODE=opencode requiere OPENCODE_GO_API_KEY en .env"`).
- **`/v1/models` response**: rebuilds dynamically from `getBrainModels()` (so the client sees whatever brains the active mode exposes; in hybrid, the client sees both flavors).
- **`/health` endpoint**: includes `mode` (resolved), `activeBrainProvider.name`, `activeVisionProvider.name`, and the active `BRAIN_MODELS` IDs for debugging.

### 9. Testing

#### New Unit Tests

| File | Coverage |
|---|---|
| `tests/unit/services/opencodeGoBrainProvider.test.ts` | Direct port of the existing `opencodeGoService.test.ts`. Same fixtures, same assertions, new filename. |
| `tests/unit/services/deepseekBrainProvider.test.ts` | Mocks axios; verifies URL = `${DEEPSEEK_BASE_URL}/chat/completions`, header = `Bearer $DEEPSEEK_API_KEY`, payload includes `thinking:{type:"enabled"}`, retry on 503/429 with backoff 2s/4s, throw on non-retryable. |
| `tests/unit/services/minimaxM3VisionProvider.test.ts` | Mocks axios; verifies URL = `${MINIMAX_BASE_URL}/v1/messages`, headers include `anthropic-version`, body has `model:"MiniMax-M3"`, single user message with `{type:"text", text: prompt + userContext}` and `{type:"image", source:{type:"url", url:imageUrl}}`. Confirms **no `thinking` block**. Tests `supportsContentType("image")` = true, `"video"` = true, `"audio"` = false. |
| `tests/unit/services/mimoSensesVisionProvider.test.ts` | Direct port of the existing test, renamed. |
| `tests/unit/services/providerSelector.test.ts` | Envs for `BRAIN_MODE` × key combinations, covering all four values (`opencode`, `deepseek`, `auto`, `hybrid`) and the missing-key error paths. Asserts: resolved mode, active provider names, registered `BRAIN_MODELS` keys (in hybrid: presence of both flavors), vision provider selection per vision-key presence, warning logs for "both keys set under auto". |

In addition, `brainRegistry.test.ts` gains 1 test verifying `registerBrainEntry()` augments correctly and that the merged view (`getBrainModels()`) is visible to `getBrainEntry`, `isKnownModel`, `parseProxyModelId`, and `parseLocalProxyModelId`.

#### Updated Unit Tests

| File | Change |
|---|---|
| `tests/unit/services/brainRegistry.test.ts` | Add 1 test: `registerBrainEntry()` augments the registry; `getBrainModels()` returns the merged view; runtime-registered entries are visible to `getBrainEntry()`, `isKnownModel()`, `parseProxyModelId()`. |
| `tests/unit/middleware/multimodalProcessor.test.ts` | Add tests that pass a mock `VisionProvider`; verify routing respects `supportsContentType`; verify fallback to `geminiService` on `describeImage` throw. |

#### Existing Tests That Must Still Pass

- `tests/unit/services/brainRegistry.test.ts` — all 4 brain entries unchanged when in public mode
- All other Vitest unit files

#### Verification Commands (end of implementation)

```bash
npm run lint
npm run build
npm run test:unit
```

All three must exit 0 with no warnings.

---

## Migration and Backwards Compatibility

### Existing Deploys (No `.env` Change)

Zero-impact. With `BRAIN_MODE` unset and `OPENCODE_GO_API_KEY` set, behavior is byte-identical to v3.0.0. `BRAIN_MODE` defaults to `auto`, which falls back to `opencode` when `OPENCODE_GO_API_KEY` is the only brain key present. The two file renames (`opencodeGoService` → `opencodeGoBrainProvider`, `mimoSensesService` → `mimoSensesVisionProvider`) only affect internal imports — no exported names change.

### `deepseek` Mode (New Path)

The user adds `BRAIN_MODE=deepseek` + `DEEPSEEK_API_KEY` (and optional `MINIMAX_API_KEY`) to `.env`, restarts, and gets a working proxy pointed at their accounts. No `opencode.json` edit required. `proxy/deepseek-v4-pro` and `proxy/deepseek-v4-flash` resolve to the user's DeepSeek account. Claude Code mappings (`haiku`/`sonnet`/`opus`) continue to work as long as the targeted brain ID is registered in `deepseek` mode (sonnet → `proxy/deepseek-v4-pro` resolves to user's DeepSeek V4 Pro); `opus` → `proxy/glm-5.2` will surface a clear "unknown model" error in `deepseek` mode since GLM is not registered — documented in README as expected behavior.

### `hybrid` Mode (New Path)

Both sets of keys can stay in `.env`. User sets `BRAIN_MODE=hybrid` and registers up to 4 OpenCode Go brains + 2 local DeepSeek brains (under `proxy/local-*` IDs). Vision follows `MINIMAX_API_KEY` presence. Existing `opencode.json` clients keep working unchanged; new clients (or those wanting to compare) can use the `proxy/local-*` IDs.

### Breaking Changes

None. All four `BRAIN_MODE` values resolve to a working configuration for users who set their respective keys (or default to `auto` for legacy behavior).

### Behavior Changes Visible to Clients in `opencode` Mode (or auto-resolved `opencode`)

None.

### Pricing Documentation Update

- `README.md` and `MODELS.md` (combined pricing table) currently state `proxy/deepseek-v4-pro` at $1.74/$3.48 (pre-June 2026). Updated to $0.435/$0.87 as part of this scope.
- `CLAUDE.md` and `MODELS.md` updated to reflect: 4 brains in opencode/auto-resolved-opencode modes; 2 brains in deepseek/auto-resolved-deepseek modes; 6 brains in hybrid mode.

---

## Out of Scope

- Adding a third brain provider (e.g. `ClaudeDirectBrainProvider`, `OpenAIDirectBrainProvider`). The interface is designed for it but this spec does not implement any.
- Setting `MINIMAX_API_KEY` without a brain key (no vision-only mode).
- MiniMax-M3 as a brain (text-only routing through M3). The architecture supports it; future scope.
- Multimodal bypass mode for `proxy/deepseek-v4-pro` (DeepSeek V4 has no vision branch in this proxy).
- Auto-failover between local and public providers (e.g. if DeepSeek rate-limits, fall back to OpenCode Go). Not requested.
- Modifying the legacy residual names (`systemctl start deepseek-proxy`, `setup-deepseek-proxy.sh`, the `deepseek-*` test comments). Tracked separately, not part of this scope.

## Risks

| Risk | Mitigation |
|---|---|
| DeepSeek pricing changes again after this spec is implemented | Pricing lives in `BRAIN_MODELS` entries; updating them is a one-line change per model. README's combined pricing table is updated manually as part of this scope; future updates are tracked separately. |
| MiniMax-M3 `/anthropic` endpoint reports 200K context (client-side autocompact) | M3 is the **senses provider** in this design, not a brain. Description requests are small (image + prompt). No production impact. If M3 is later registered as a brain, this becomes a real concern and follows the MiMo V2.5 pattern (800K client-visible). |
| `processMultimodalContent` signature change breaks unknown call sites | Internal-only function; existing callers are in `index.ts`, which is updated in the same change. Verified via `rg "processMultimodalContent" src/`. |
| Module-load cycle between `providerSelector.ts` and `index.ts` (both importing each other) | `providerSelector.ts` exports singleton state initialized eagerly; `index.ts` imports from it. No cycle. `multimodalProcessor.ts` imports `getActiveVisionProvider()` lazily (function call, not top-level import). |
| The `BrainModelEntry` interface move causes breaking imports | `BrainModelEntry` is currently exported from `brainRegistry.ts`. After this change, it is re-exported from both `brainRegistry.ts` (for backwards-compat in existing imports) and `brainProvider.ts` (canonical). Existing imports `from "./brainRegistry"` keep working. |
| `hybrid` mode doubles `/v1/models` count and confuses clients | Documented in README and CLAUDE.md that hybrid mode is for power users who want side-by-side comparison. Documented in `opencode.json` example that the `local-*` IDs are aliases for the user's local provider. |
| Test mocks that hardcode `OPENCODE_GO_API_KEY` fail under `BRAIN_MODE` selection | `providerSelector.test.ts` resets env between cases; documented in test setup. Other tests that need a stable config set `BRAIN_MODE=opencode` explicitly in a `beforeAll`. |

---

## Open Questions

None. All decisions confirmed during brainstorming (2026-07-21).

---

## Implementation Order (out of scope here; for the plan)

For reference only — the writing-plans skill will produce the actual task list:

1. Extract `openAIToAnthropicPayload` → `anthropicPayloadConverter.ts`.
2. Add `BrainModelEntry` re-export from `brainProvider.ts`.
3. Rename `opencodeGoService.ts` → `opencodeGoBrainProvider.ts`; refactor to implement `BrainProvider`.
4. Rename `mimoSensesService.ts` → `mimoSensesVisionProvider.ts`; refactor to implement `VisionProvider`.
5. Implement `DeepSeekBrainProvider`.
6. Implement `MiniMaxM3VisionProvider`.
7. Update `brainRegistry.ts` to expose `BRAIN_MODELS_BASE` + `registerBrainEntry` + `getBrainModels`.
8. Implement `providerSelector.ts` (`BRAIN_MODE` resolution algorithm + factory + warning logs + registerBrainEntry calls per mode).
9. Update `multimodalProcessor.ts` to accept and dispatch on `VisionProvider.supportsContentType()`.
10. Update `index.ts` to use `getActiveBrainProvider()` and `getActiveVisionProvider()`.
11. Update `.env.example`, `README.md`, `CLAUDE.md`, `MODELS.md`.
12. Update existing tests (renames + `brainRegistry` augmentation test).
13. Add new tests (`DeepSeekBrainProvider`, `MiniMaxM3VisionProvider`, `providerSelector`).
14. Run `npm run lint && npm run build && npm run test:unit`.
15. Smoke test with both modes (mocked env in unit tests; live test in personal deploy).
