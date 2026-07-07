# Cortex Sensorial v3 — OpenCode Go Integration

**Project rename**: `deepseek-multimodal-proxy` → `cortex-multimodal-proxy`. Affects package.json `name`, Docker image, repo name, `/health` `service` field, log prefix, README title. Internal architectural name "Cortex Sensorial v3" stays.

**Status**: Design proposal (pending user approval)
**Date**: 2026-07-06
**Scope**: Replace DeepSeek-as-brain + Gemini-as-senses with OpenCode Go models. MiMo V2.5 replaces Gemini for image description; 9 text-only brains exposed via `proxy/<model-id>`; natively multimodal models passthrough.

## Background

Current proxy (`deepseek-multimodal-proxy`) is hardcoded to DeepSeek V4 (brain) + Gemini 2.5 Flash (senses). The OpenCode Go subscription ($10/month) gives access to 13 models through a single Bearer token at `https://opencode.ai/zen/go/v1/`. Goal: generalize the proxy so any text-only OpenCode Go model can act as brain, and MiMo V2.5 acts as the senses layer for images. Audio/video/PDFs keep Gemini as fallback.

This reverses the CLAUDE.md:12 policy that previously ruled out Qwen/MiniMax as vision alternatives — that rule was based on v2.0.0 trials where Qwen was the brain+senses combination; here MiMo V2.5 is strictly the senses layer (cheap, dedicated) and never the brain for text-only models.

## Goals

1. Expose 9 text-only brains via `proxy/<model-id>` in `/v1/models`.
2. MiMo V2.5 describes images; brain receives text descriptions.
3. Gemini stays as fallback for audio/video/PDFs (preserves existing capability).
4. Natively multimodal models (MiMo V2.5/Pro, MiniMax M3/M2.7) pass through the proxy unmodified.
5. OpenCode (OpenAI-compatible) and Claude Code (Anthropic-compatible) both work without changes on the client side.
6. Single Bearer token replaces DEEPSEEK_API_KEY + GEMINI_API_KEY.

## Non-Goals

- Multi-tenant routing (one workspace, one key).
- Cost tracking per model (OpenCode console already does this).
- Caching across models (the contextual SHA-256 cache stays per-model).
- Supporting Qwen3.6 Plus, Qwen3.7 Plus/Max, MiniMax M3/M2.7 as brains (those are natively multimodal Anthropic-format; user explicitly excluded from the proxy layer).

## Architecture

### High-level flow

```
Client (OpenCode or Claude Code)
        │
        ▼
   POST /v1/chat/completions  or  POST /v1/messages
        │
        ▼
   multimodalProcessor.processMultimodalContent(messages, model)
        │
        ├── model == "mimo-v2.5" / "mimo-v2.5-pro" / "minimax-m3" / "minimax-m2.7"
        │      → passthrough: forward directly to OpenCode Go (natively multimodal)
        │
        ├── model starts with "proxy/"
        │      → branch: detect content
        │           ├── text only → forward to OpenCode Go with brain model ID
        │           ├── image     → mimoSensesService.describe(image)
        │           │              → inject description into user message
        │           │              → forward to OpenCode Go with brain model ID
        │           ├── audio / video / PDF>1MB
        │           │              → geminiService.describe(media)  (fallback)
        │           │              → inject description into user message
        │           │              → forward to OpenCode Go with brain model ID
        │           └── PDF<1MB    → local pdfProcessor → text → brain
        │
        └── other → 400 unknown model
        │
        ▼
   OpenCode Go: https://opencode.ai/zen/go/v1/chat/completions
   Auth: Authorization: Bearer <OPENCODE_GO_API_KEY>
```

### Routing strategy header

`X-Multimodal-Strategy` exposes one of:

| Value | Meaning |
|-------|---------|
| `passthrough` | Natively multimodal model, no proxy transformation |
| `direct` | Text-only brain, text-only content, no senses needed |
| `vision-mimo` | Image routed through MiMo V2.5 |
| `vision-gemini-fallback` | Audio/video/PDF routed through Gemini |
| `local-pdf` | Small PDF processed locally |
| `mixed` | Multiple modalities in one request |

### Services

| Service | Role | Replaces |
|---------|------|----------|
| `opencodeGoService` (new) | Brain caller for all 9 text-only models + 4 natively multimodal models | `deepseekService` |
| `mimoSensesService` (new) | Image description via MiMo V2.5 | `geminiService` (image branch only) |
| `geminiService` (kept) | Audio, video, large-PDF fallback | unchanged |
| `anthropicAdapter` (kept) | Claude Code ↔ OpenAI translation | unchanged |
| `multimodalProcessor` (modified) | Branches image→mimoSenses, keeps audio/video/PDF→geminiService | unchanged structure |

### Configuration

`.env` (new keys, old keys removed or kept-for-fallback):

```bash
# Required (replaces DEEPSEEK_API_KEY)
OPENCODE_GO_API_KEY=sk-...

# Required for audio/video/PDF fallback (keep existing)
GEMINI_API_KEY=...

# Optional
OPENCODE_GO_BASE_URL=https://opencode.ai/zen/go/v1
OPENCODE_GO_TIMEOUT_MS=120000

# Senses
SENSES_MODEL=mimo-v2.5            # only MiMo V2.5 supported in v3

# Claude Code model aliases (existing pattern, updated)
CLAUDE_HAIKU_MODEL=mimo-v2.5             # passthrough, multimodal native
CLAUDE_SONNET_MODEL=proxy/kimi-k2.6
CLAUDE_OPUS_MODEL=proxy/glm-5.2

# Thinking defaults (per-brain handled in service)
DEEPSEEK_THINKING_EFFORT=max             # kept for back-compat in code
```

### Brain registry (in code)

```ts
// src/services/brainRegistry.ts
export const BRAIN_MODELS = {
  "proxy/kimi-k2.7-code":  { upstream: "kimi-k2.7-code",  context: 262144, maxOutput: 262144, thinking: false, inputPrice: 0.95, outputPrice: 4.00, endpoint: "openai" },
  "proxy/kimi-k2.6":       { upstream: "kimi-k2.6",       context: 262144, maxOutput: 65536,  thinking: false, inputPrice: 0.95, outputPrice: 4.00, endpoint: "openai" },
  "proxy/glm-5.2":         { upstream: "glm-5.2",         context: 1048576, maxOutput: 131072, thinking: true,  inputPrice: 1.40, outputPrice: 4.40, endpoint: "openai" },
  "proxy/glm-5.1":         { upstream: "glm-5.1",         context: 202752,  maxOutput: 32768,  thinking: true,  inputPrice: 1.40, outputPrice: 4.40, endpoint: "openai" },
  "proxy/qwen3.7-plus":    { upstream: "qwen3.7-plus",    context: 1048576, maxOutput: 65536,  thinking: false, inputPrice: 0.40, outputPrice: 1.60, endpoint: "anthropic" },
  "proxy/qwen3.7-max":     { upstream: "qwen3.7-max",     context: 1048576, maxOutput: 65536,  thinking: true,  inputPrice: 2.50, outputPrice: 7.50, endpoint: "anthropic" },
  "proxy/qwen3.6-plus":    { upstream: "qwen3.6-plus",    context: 1048576, maxOutput: 65536,  thinking: false, inputPrice: 0.50, outputPrice: 3.00, endpoint: "anthropic" },
  "proxy/deepseek-v4-flash":{ upstream: "deepseek-v4-flash", context: 1048576, maxOutput: 384000, thinking: true, inputPrice: 0.14, outputPrice: 0.28, endpoint: "openai" },
  "proxy/deepseek-v4-pro": { upstream: "deepseek-v4-pro", context: 1048576, maxOutput: 384000, thinking: true,  inputPrice: 1.74, outputPrice: 3.48, endpoint: "openai" },
};

export const PASSTHROUGH_MODELS = new Set([
  "mimo-v2.5",
  "mimo-v2.5-pro",
  "minimax-m3",
  "minimax-m2.7",
]);
```

`endpoint` is the OpenCode Go transport family: `openai` hits `/chat/completions`, `anthropic` hits `/messages`. Both at the same base URL, different paths.

### Pricing table (combined worst-case, for README)

Each `proxy/<brain>` cost = `mimo-v2.5 image description + <brain> text reasoning`. Worst case: image adds $0.14 in / $0.28 out (MiMo V2.5) on top of the brain.

| Brain | Image in | Brain in | Brain out | Total in | Total out |
|-------|----------|----------|-----------|----------|-----------|
| Kimi K2.7 Code | 0.14 | 0.95 | 4.00 | 1.09 | 4.00 |
| Kimi K2.6 | 0.14 | 0.95 | 4.00 | 1.09 | 4.00 |
| GLM-5.2 | 0.14 | 1.40 | 4.40 | 1.54 | 4.40 |
| GLM-5.1 | 0.14 | 1.40 | 4.40 | 1.54 | 4.40 |
| Qwen3.7 Plus | 0.14 | 0.40 | 1.60 | 0.54 | 1.60 |
| Qwen3.7 Max | 0.14 | 2.50 | 7.50 | 2.64 | 7.50 |
| Qwen3.6 Plus | 0.14 | 0.50 | 3.00 | 0.64 | 3.00 |
| DeepSeek V4 Flash | 0.14 | 0.14 | 0.28 | 0.28 | 0.28 |
| DeepSeek V4 Pro | 0.14 | 1.74 | 3.48 | 1.88 | 3.48 |

(All values per 1M tokens. Audio/video/PDF still incurs Gemini cost on top.)

## File-by-file changes

### New files

- `src/services/opencodeGoService.ts` — generic OpenCode Go caller; constructor takes model registry entry; handles both `/chat/completions` and `/messages` endpoints based on `endpoint` field.
- `src/services/mimoSensesService.ts` — image description via MiMo V2.5; same call shape as `geminiService.describeImage()`.
- `src/services/brainRegistry.ts` — `BRAIN_MODELS` constant + helpers (`getBrainEntry`, `isPassthrough`, `parseProxyModelId`).
- `src/utils/opencodeGoModels.ts` — list of exposed models for `/v1/models`.

### Modified files

- `src/index.ts`
  - `/v1/models`: returns 9 `proxy/<brain>` models for OpenCode, `haiku`/`sonnet`/`opus` for Claude Code.
  - `/v1/chat/completions`: branch on `model.startsWith("proxy/")` → `opencodeGoService`; native multimodal → passthrough.
  - `/v1/messages`: `haiku` → `mimo-v2.5` passthrough; `sonnet`/`opus` → mapped proxy brain.
- `src/middleware/multimodalProcessor.ts`
  - New strategy `vision-mimo` for image branch.
  - Audio/video/PDF branches unchanged (still call `geminiService`).
  - PDF<1MB unchanged.
- `src/services/deepseekService.ts`
  - Rename to `opencodeGoService.ts` (or keep file, expand to all brains).
  - Existing `mapModel()` replaced by `brainRegistry.getBrainEntry(proxyModelId)`.
- `.env.example`
  - Replace `DEEPSEEK_API_KEY` with `OPENCODE_GO_API_KEY`.
  - Add `CLAUDE_HAIKU_MODEL`, `CLAUDE_SONNET_MODEL`, `CLAUDE_OPUS_MODEL`.
- `README.md`, `CLAUDE.md`
  - Replace "Gemini Edition" naming with "OpenCode Go Edition" / "Cortex Sensorial v3".
  - Update pricing table (9 brains).
  - Remove the "Qwen/MiniMax reverted" line (now explicitly used).
- `MODELS.md` (or create) — full per-model table with pricing and capabilities.
- Tests: `test/unit/opencodeGoService.test.ts`, `mimoSensesService.test.ts`; update existing `deepseekService` tests.

### Deleted files

- None. `deepseekService.ts` is renamed/repurposed, `geminiService.ts` stays as fallback.

## Compatibility contract

| Client | Endpoint | Behavior |
|--------|----------|----------|
| OpenCode | `/v1/chat/completions` | `model: "proxy/<brain>"` selects brain. OpenAI-format in/out. |
| Claude Code | `/v1/messages` | `model: "haiku"\|"sonnet"\|"opus"` mapped via env to either passthrough or proxy brain. Anthropic-format in/out. |

Both clients unchanged. The proxy absorbs all complexity.

## Edge cases

1. **Image in natively multimodal model request**: passthrough forwards image directly to OpenCode Go (no MiMo V2.5 sense layer needed — model handles it).
2. **Audio/video in Claude Code haiku**: haiku → mimo-v2.5 passthrough. But MiMo V2.5 doesn't take audio. → Detect audio in multimodalProcessor, return 400 "audio not supported for haiku passthrough". User must use `sonnet` or `opus`.
3. **Mixed image + text**: image goes through MiMo V2.5 → description; brain receives text + description.
4. **PDF > 1MB**: Gemini fallback (unchanged). PDF < 1MB: local parser (unchanged).
5. **Tool/function calls**: forwarded as-is to brain; brain model must support tools (most do).
6. **Streaming**: both passthrough and brain paths support SSE; `anthropicAdapter` handles Anthropic-format conversion.
7. **Thinking blocks**: DeepSeek V4 keeps `reasoning_effort: max`. Other brains with `thinking: true` get appropriate effort param. Brains with `thinking: false` never receive thinking config.

## Testing

- Unit tests for `brainRegistry` lookup, `opencodeGoService` per-endpoint routing, `mimoSensesService` image call.
- Integration test `test/test-master.js` updated: smoke test each of 9 `proxy/<brain>` models + 4 passthrough models.
- Manual test with OpenCode: pick `proxy/deepseek-v4-pro`, send image, verify MiMo V2.5 description appears in response.
- Manual test with Claude Code: pick `sonnet` (→ `proxy/kimi-k2.6`), send image, verify response.

## Rollback plan

- Git revert works because feature is on a `feat/opencode-go-cortex-v3` branch.
- `.env` keys are new; old `DEEPSEEK_API_KEY` is no longer required.
- If MiMo V2.5 fails: revert image branch to `geminiService` in `multimodalProcessor.ts` (one-line change).
- If OpenCode Go fails: proxy returns 502 with reason; client retries.

## Risks

1. **MiMo V2.5 multimodal quality**: unproven for image description vs Gemini 2.5 Flash. Mitigation: 30-second fallback to Gemini if MiMo V2.5 returns error.
2. **Anthropic-format models** (Qwen, MiniMax): the proxy exposes `proxy/qwen3.7-max` etc. but the actual upstream call goes to `/messages` (Anthropic format). Internal translation layer needed in `opencodeGoService`. Adds complexity.
3. **OpenCode Go rate limits**: $12/5h rolling limit. If exceeded, requests fail with 429. User must wait or top up Zen balance.
4. **Per-model thinking support**: not all 9 brains support thinking. `brainRegistry` field `thinking: boolean` decides whether to send the param.

## Out of scope (future work)

- Web search / code search tools forwarded to OpenCode Go (some brains support these).
- Caching layer specific to brain+senses pair (avoid re-describing same image for different brains).
- Cost tracking endpoint that aggregates across brains.
- Web UI for live brain switching.