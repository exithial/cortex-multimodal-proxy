# System Services

This directory contains the core business logic of the proxy.

## Service Descriptions

### `brainRegistry.ts`

**Responsibility**: Single source of truth for brain and passthrough models.

- **Catalog**: 2 brains (`proxy/glm-5.2`, `proxy/deepseek-v4-pro`) + 1 passthrough (`mimo-v2.5`).
- **Per-brain metadata**: `upstream`, `context` (819200), `maxOutput`, `thinking`, pricing, `endpoint` (openai/anthropic), `multimodal`.
- **Helpers**: `getBrainEntry`, `isPassthrough`, `parseProxyModelId`, `isKnownModel`.
- **Prototype safety**: uses `Object.hasOwn()` for registry lookups.

### `mimoSensesService.ts`

**Responsibility**: MiMo V2.5 multimodal perception for images.

- Replaces Gemini 2.5 Flash for the image-description pipeline.
- Sends base64/data-URL images to `mimo-v2.5` via OpenCode Go `/chat/completions`.
- Adaptive Spanish-language prompt for technical image description.
- Reports `usage` tokens after each description.

### `opencodeGoService.ts`

**Responsibility**: Generic caller for all OpenCode Go endpoints.

- Supports both `/chat/completions` (OpenAI-format) and `/messages` (Anthropic-format) per brain entry.
- **Retry**: 3 attempts with exponential backoff (2s, 4s) on upstream 503/502/429; respects `Retry-After` header.
- **Streaming**: SSE buffering with `safeEnd` guard against double-end; emits raw `data:` chunks to the client.
- **Auth**: `Bearer` for OpenAI-format, `x-api-key` + `anthropic-version` for Anthropic-format.
- **Thinking**: adds `thinking: { type: "enabled" }` for brains marked with `thinking: true`.

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