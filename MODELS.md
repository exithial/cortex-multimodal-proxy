# MODELS.md — Cortex Multimodal Proxy v3.0.0

## Brain Models (Text-Only, via `proxy/` prefix)

| Model ID | Upstream | Endpoint | Thinking | Context | Max Output | Input/Output per 1M | Combined with MiMo senses |
|----------|----------|----------|----------|---------|------------|---------------------|---------------------------|
| `proxy/glm-5.2` | `glm-5.2` | OpenAI | ✅ Always-on | 1M | 131K | $1.40 / $4.40 | $1.54 / $4.40 |
| `proxy/qwen3.7-max` | `qwen3.7-max` | OpenAI | ✅ Always-on | 1M | 65K | $2.50 / $7.50 | $2.64 / $7.50 |
| `proxy/deepseek-v4-pro` | `deepseek-v4-pro` | OpenAI | ✅ Always-on | 1M | 384K | $1.74 / $3.48 | $1.88 / $3.48 |

All brains are text-only. Images go through MiMo V2.5 senses layer first (adds $0.14/$0.28 per 1M).
All brains use `thinking: { type: "enabled" }` for max reasoning.
All brains use OpenAI-format endpoint at `https://opencode.ai/zen/go/v1/chat/completions`.

## Passthrough Models (Natively Multimodal, no proxy prefix)

| Model ID | Endpoint | Thinking | Context | Max Output | Input/Output per 1M |
|----------|----------|----------|---------|------------|---------------------|
| `mimo-v2.5` | OpenAI | ✅ | 1M | 128K | $0.14 / $0.28 |
| `mimo-v2.5-pro` | OpenAI | ✅ | 1M | 128K | $1.74 / $3.48 |
| `minimax-m3` | OpenAI | ❌ | 1M | 128K | $0.30 / $1.20 |
| `minimax-m2.7` | OpenAI | ❌ | 1M | 128K | $0.30 / $1.20 |

Passthrough models handle images natively — no MiMo V2.5 senses layer needed.
Available in `/v1/models` but not proxied (configured directly in OpenCode).

## Senses Layer

| Service | Model | Purpose | Input/Output per 1M |
|---------|-------|---------|---------------------|
| MiMo V2.5 Senses | `mimo-v2.5` | Image description for text-only brains | $0.14 / $0.28 |
| Gemini 2.5 Flash | `gemini-2.5-flash` | Audio/video/PDF fallback (optional) | ~$0.075 / $0.30 |

## Claude Code Mappings

| Claude Code | Default Model | Env Var Override | Strategy |
|-------------|---------------|------------------|----------|
| `haiku` | `mimo-v2.5` | `CLAUDE_HAIKU_MODEL` | Passthrough (multimodal native) |
| `sonnet` | `proxy/deepseek-v4-pro` | `CLAUDE_SONNET_MODEL` | Proxy brain + MiMo senses for images |
| `opus` | `proxy/glm-5.2` | `CLAUDE_OPUS_MODEL` | Proxy brain + MiMo senses for images |

## Thinking Configuration

All3 brains use max thinking via `thinking: { type: "enabled" }` parameter.

| Model | Thinking Behavior | Notes |
|-------|-------------------|-------|
| GLM-5.2 | Always-on | Responds via `reasoning_content` field |
| Qwen3.7 Max | Always-on | Responds via `reasoning_content` field (OpenAI-format) |
| DeepSeek V4 Pro | Always-on | Responds via `reasoning_content` field |

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
| Qwen3.7 Max | ⚠️ Intermittent | ⚠️ | Upstream availability varies; proxy retries help |
| DeepSeek V4 Pro | ✅ | ✅ | Always thinking, responds in reasoning_content |
| MiMo V2.5 | ✅ | ✅ | Passthrough, no senses layer |
| Kimi K2.6 | ✅ | N/A | Removed from brain catalog (was text-only) |
| Qwen3.7 Plus | ✅ | N/A | Removed from brain catalog (was multimodal native) |

## OpenCode Go Endpoint

- **Base URL**: `https://opencode.ai/zen/go/v1`
- **Auth**: `Authorization: Bearer <OPENCODE_GO_API_KEY>`
- **OpenAI-format**: `/chat/completions` (all brains + passthrough models)
- **Anthropic-format**: `/messages` (unused — all models verified to work with OpenAI-format)
- **Model list**: `GET /v1/models`

## Legacy Models (Removed)

These models were in the v2.0.0 brain catalog but removed in v3.0.0:

| Old Model ID | Reason for Removal |
|--------------|-------------------|
| `deepseek-multimodal-flash` | Replaced by `proxy/deepseek-v4-pro` (same provider, stronger model) |
| `deepseek-multimodal-pro` | Replaced by `proxy/deepseek-v4-pro` |
| `vision-direct` | Replaced by `mimo-v2.5` passthrough |
| `proxy/kimi-k2.7-code` | Removed — consolidated to3 brains |
| `proxy/kimi-k2.6` | Removed — consolidated to3 brains |
| `proxy/glm-5.1` | Removed — consolidated to3 brains |
| `proxy/qwen3.7-plus` | Removed — consolidated to3 brains |
| `proxy/qwen3.6-plus` | Removed — consolidated to3 brains |
| `proxy/deepseek-v4-flash` | Removed — consolidated to3 brains |
