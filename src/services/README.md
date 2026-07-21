# System Services

This directory contains the core business logic of the proxy.

## Service Descriptions

### `brainRegistry.ts`

**Responsibility**: Single source of truth for brain and passthrough models.

- **Catalog**: 4 brains (`proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro`) + 1 passthrough (`mimo-v2.5`).
- **Per-brain metadata**: `upstream`, `context` (real upstream limit — 1M for all 4 current brains), `maxOutput`, `thinking`, pricing, `endpoint` (openai/anthropic), `multimodal`.
- **Helpers**: `getBrainEntry`, `isPassthrough`, `parseProxyModelId`, `isKnownModel`.
- **Prototype safety**: uses `Object.hasOwn()` for registry lookups.

### `mimoSensesVisionProvider.ts`

**Responsibility**: MiMo V2.5 multimodal perception for images (implements `VisionProvider`).

- Replaces Gemini 2.5 Flash for the image-description pipeline when an OpenCode Go brain is active.
- Sends base64/data-URL images to `mimo-v2.5` via OpenCode Go `/chat/completions`.
- Adaptive Spanish-language prompt for technical image description.
- Reports `usage` tokens after each description.
- `supportsContentType`: image=true; video=false; audio=false.

### `opencodeGoBrainProvider.ts`

**Responsibility**: Generic caller for all OpenCode Go endpoints (implements `BrainProvider`).

- Supports both `/chat/completions` (OpenAI-format) and `/messages` (Anthropic-format) per brain entry.
- **Retry**: 3 attempts with exponential backoff (2s, 4s) on upstream 503/502/429; respects `Retry-After` header.
- **Streaming**: SSE buffering with `safeEnd` guard against double-end; emits raw `data:` chunks to the client.
- **Auth**: `Bearer` for OpenAI-format, `x-api-key` + `anthropic-version` for Anthropic-format.
- **Thinking**: adds `thinking: { type: "enabled" }` for brains marked with `thinking: true`.

### `deepseekBrainProvider.ts`

**Responsibility**: Direct DeepSeek V4 Pro / V4 Flash brain caller (implements `BrainProvider`, used in `BRAIN_MODE=deepseek` and the `proxy/local-*` IDs of `BRAIN_MODE=hybrid`).

- OpenAI-compatible endpoint at `${DEEPSEEK_BASE_URL}/chat/completions` (default `https://api.deepseek.com`).
- Bearer auth from `DEEPSEEK_API_KEY`.
- Thinking-max via `thinking: { type: "enabled" }` (same retry curve as `opencodeGoBrainProvider`).
- Streaming: OpenAI SSE passthrough.

### `minimaxM3VisionProvider.ts`

**Responsibility**: MiniMax M3 vision (text + image + video) for `BRAIN_MODE=deepseek` and `BRAIN_MODE=hybrid` (implements `VisionProvider`).

- Anthropic-format POST to `${MINIMAX_BASE_URL}/v1/messages` (default `https://api.minimax.io/anthropic`).
- `model = SENSES_MODEL` (default `MiniMax-M3`). Image content via `{type:"image", source:{type:"url", url: imageUrl}}`.
- **No `thinking` block** (disabled by design).
- `supportsContentType`: image=true; video=true; audio=false.

### `brainProvider.ts` / `visionProvider.ts`

**Responsibility**: TypeScript interfaces for the pluggable provider abstraction.

- `BrainProvider` (6 required + 1 optional method: `name`, `buildPayload`, `resolveEndpointUrl`, `buildAuthHeaders`, `createChatCompletion`, `chatCompletionStream`, optional `convertAnthropicChunkToOpenAI`).
- `VisionProvider` (`name`, `isAvailable`, `supportsContentType(type)`, `describeImage`).
- `BrainModelEntry` (canonical declaration here; `brainRegistry.ts` re-exports for backwards-compat).

### `anthropicPayloadConverter.ts`

**Responsibility**: Standalone helper extracted from `opencodeGoBrainProvider` — converts OpenAI-format payloads to Anthropic-format (`openAIToAnthropicPayload`). Reused by any future Anthropic-format brain provider.

### `providerSelector.ts`

**Responsibility**: `BRAIN_MODE` resolver + factory. Reads `BRAIN_MODE` env var, validates required keys, registers the active mode's brain entries (`registerBrainEntry`), instantiates the active brain and vision providers, exposes `getActiveBrainProvider` / `getActiveVisionProvider` / `getActiveBrainModels` / `getActiveBrainProviderFor(modelId)` / `getActiveProviderInfo`. Per-request dispatch uses `BrainModelEntry.providerName` to route to the right provider in `BRAIN_MODE=hybrid`.

### `messageTransforms.ts`

**Responsibility**: Shared message helpers (DRY between brains).

- `prepareMessages`: filters valid roles, normalizes `content`, preserves `tool_calls` / `tool_call_id` / `reasoning_content`.
- `truncateMessages`: trims oldest non-system messages when token estimate exceeds `context * 0.7`.

### `geminiService.ts`

**Responsibility**: Gemini 2.5 Flash fallback for audio/video/PDF when MiMo senses don't apply.

- Only used when client sends audio/video/PDFs to a non-passthrough brain.
- Contextual SHA-256 cache (image + question) to avoid repeated calls.

### `anthropicAdapter.ts`

**Responsibility**: Bidirectional translation between Anthropic (Claude Code) and OpenAI (proxy) formats.

- Converts `/v1/messages` (Anthropic) requests to `/v1/chat/completions` (OpenAI).
- Maps Claude models (`haiku`/`sonnet`/`opus`) to internal models via env vars.
- Converts OpenAI responses to Anthropic format (non-streaming + SSE).
- Translates `tool_use` / `tool_result` / `thinking` blocks.

### `cacheService.ts`

**Responsibility**: Persistent storage of multimodal content descriptions.

- **Backend**: Filesystem (JSON).
- **TTL**: Configurable (default 7 days).
- Avoids unnecessary API quota spending by reusing descriptions for identical content (SHA-256).