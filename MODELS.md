# MODELS.md — Cortex Multimodal Proxy

**Modes**: `BRAIN_MODE=auto` (default) | `opencode` | `deepseek` | `hybrid`. See README "Modes" section. DeepSeek V4 Pro pricing reflects June 2026 cut ($0.435/$0.87).

## Brain Models (Text-Only, via `proxy/` prefix)

| Model ID | Upstream | Endpoint | Thinking | Context | Max Output | Input/Output per 1M | Combined with MiMo senses |
|----------|----------|----------|----------|---------|------------|---------------------|---------------------------|
| `proxy/glm-5.2` | `glm-5.2` | OpenAI | ✅ Always-on | 800K¹ | 131K | $1.40 / $4.40 | $1.54 / $4.40 |
| `proxy/deepseek-v4-pro` | `deepseek-v4-pro` | OpenAI | ✅ Always-on | 800K¹ | 384K | $0.435 / $0.87 | $0.575 / $1.15 |
| `proxy/qwen3.7-max` | `qwen3.7-max` | Anthropic | ✅ Always-on | 800K¹ | 65K | $2.50 / $7.50 | $2.64 / $7.78 |
| `proxy/mimo-v2.5-pro` | `mimo-v2.5-pro` | OpenAI | ✅ Always-on | 800K¹ | 65K | $1.74 / $3.48 | $1.88 / $3.76 |
| `proxy/local-deepseek-v4-pro`  | `deepseek-v4-pro` | OpenAI | ✅ | 800K | 384K | $0.435 / $0.87 | (your account) |
| `proxy/local-deepseek-v4-flash` | `deepseek-v4-flash` | OpenAI | ✅ | 800K | 384K | $0.14 / $0.28 | (your account) |

All brains are text-only. Images go through MiMo V2.5 senses layer first (adds $0.14/$0.28 per 1M).
¹ Context column = client-visible auto-compact target (OpenCode TUI uses this to decide when to compact its own history). All 4 brains accept **1M** upstream natively; the proxy sends up to 1M via `BrainModelEntry.context` (see `src/services/brainRegistry.ts`). The 200K gap is mandatory headroom for MiMo senses image descriptions — see CLAUDE.md § "Brain context window policy".
All brains use `thinking: { type: "enabled" }` for max reasoning.
All brains use OpenAI-format endpoint at `https://opencode.ai/zen/go/v1/chat/completions`.

## Passthrough Models (Natively Multimodal, no proxy prefix)

| Model ID | Endpoint | Thinking | Context | Max Output | Input/Output per 1M | Available in |
|----------|----------|----------|---------|------------|---------------------|--------------|
| `mimo-v2.5` | OpenAI (via OpenCode Go) | ✅ | 1M | 128K | $0.14 / $0.28 | `BRAIN_MODE=opencode` / `hybrid` |
| `MiniMax-M3` | Anthropic (`/v1/messages`) | ✅ adaptive (model-decided budget) | 1M | 65K | varies | `BRAIN_MODE=deepseek` / `hybrid` (requires `MINIMAX_API_KEY`) |

Passthrough models handle images natively — no MiMo V2.5 senses layer needed.
Exposed in `/v1/models` according to the active `BRAIN_MODE` (`getActiveProviderInfo().mode` in `src/services/providerSelector.ts`). The proxy routes the model directly to the upstream provider; only one passthrough is exposed at a time.

## Senses Layer

| Service | Model | Purpose | Input/Output per 1M |
|---------|-------|---------|---------------------|
| MiMo V2.5 Senses | `mimo-v2.5` | Image description for text-only brains | $0.14 / $0.28 |
| Gemini 2.5 Flash | `gemini-2.5-flash` | Audio/video/PDF fallback (optional) | ~$0.075 / $0.30 |

## Claude Code Mappings

| Claude Code | Default Model | Env Var Override | Strategy |
|-------------|---------------|------------------|----------|
| `haiku` | `proxy/glm-5.2` | `CLAUDE_HAIKU_MODEL` | Proxy brain + MiMo senses for images |
| `sonnet` | `proxy/deepseek-v4-pro` | `CLAUDE_SONNET_MODEL` | Proxy brain + MiMo senses for images |
| `opus` | `proxy/glm-5.2` | `CLAUDE_OPUS_MODEL` | Proxy brain + MiMo senses for images |

## Thinking Configuration

All 4 brains use max thinking via `thinking: { type: "enabled" }` parameter.

| Model | Thinking Behavior | Notes |
|-------|-------------------|-------|
| GLM-5.2 | Always-on | Responds via `reasoning_content` field |
| DeepSeek V4 Pro | Always-on | Responds via `reasoning_content` field |
| Qwen3.7 Max | Always-on | Anthropic-format, reasoning via `thinking` block |
| MiMo V2.5 Pro | Always-on | Responds via `reasoning_content` field |

## Retry Policy

The proxy retries failed requests to OpenCode Go with exponential backoff:
- **Max retries**:3
- **Base delay**:2 seconds
- **Backoff**:2s →4s →8s
- **Retryable errors**:503 (Service Unavailable),502 (Bad Gateway),429 (Rate Limited)
- **Non-retryable**:400,401,404 (immediate failure)

## Model Verification (Empirical)

Verified empirically via direct API calls to `https://opencode.ai/zen/go/v1/chat/completions`:

| Model | Direct API | Via Proxy | Notes |
|-------|-----------|-----------|-------|
| GLM-5.2 | ✅ | ✅ | Always thinking, responds in reasoning_content |
| DeepSeek V4 Pro | ✅ | ✅ | Always thinking, responds in reasoning_content |
| Qwen3.7 Max | ✅ | ✅ | Always thinking, Anthropic-format, vision via MiMo senses |
| MiMo V2.5 Pro | ✅ | ✅ | Always thinking, vision via MiMo senses |
| MiMo V2.5 | ✅ | ✅ | Passthrough, no senses layer |

## OpenCode Go Endpoint

- **Base URL**: `https://opencode.ai/zen/go/v1`
- **Auth**: `Authorization: Bearer <OPENCODE_GO_API_KEY>`
- **OpenAI-format**: `/chat/completions` (used by `proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/mimo-v2.5-pro`, plus the `mimo-v2.5` passthrough)
- **Anthropic-format**: `/messages` (used by `proxy/qwen3.7-max`; Anthropic-format conversion via `openAIToAnthropicPayload`)
- **Model list**: `GET /v1/models`

## Legacy Models (Removed)

These models were in the brain catalog but removed in v3.0.0:

| Old Model ID | Reason for Removal |
|--------------|-------------------|
| `deepseek-multimodal-flash` | Replaced by `proxy/deepseek-v4-pro` (same provider, stronger model) |
| `deepseek-multimodal-pro` | Replaced by `proxy/deepseek-v4-pro` |
| `vision-direct` | No longer needed — MiMo V2.5 senses handles images |
| `proxy/kimi-k2.7-code` | Removed — consolidated to 2 brains (later expanded to 4) |
| `proxy/kimi-k2.6` | Removed — consolidated to 2 brains (later expanded to 4) |
| `proxy/glm-5.1` | Removed — consolidated to 2 brains (later expanded to 4) |
| `proxy/qwen3.7-plus` | Removed — consolidated to 2 brains (later expanded to 4) |
| `proxy/qwen3.6-plus` | Removed — consolidated to 2 brains (later expanded to 4) |
| `proxy/deepseek-v4-flash` | Removed — consolidated to 2 brains (later expanded to 4) |
| `minimax-m3` (passthrough) | Removed — only mimo-v2.5 kept as passthrough |
| `minimax-m2.7` (passthrough) | Removed — only mimo-v2.5 kept as passthrough |
