# System Services

This directory contains the core business logic of the proxy.

## Service Descriptions

### `geminiService.ts`

**Responsibility**: Manage interaction with the Google Gemini API for vision.

- **Main Functions**:
  - `analyzeContent(source, context, type)`: Orchestrates the vision process (hash -> cache -> api).
  - Supports image, audio, video, PDF, and text.
  - Adaptive prompt generation based on user chat context.
  - Uses `GEMINI_API_KEY` for direct authentication.
  - Contextual SHA-256 cache (image + question) to avoid repeated calls.

### `deepseekService.ts`

**Responsibility**: Intermediary with the DeepSeek V4 API.

- **Completion Handling**: Supports both regular requests and streaming (SSE).
- **Unified processing**: Receives processed messages (media -> text descriptions).
- **Model mapping**: Converts proxy names to target models (e.g., `deepseek-multimodal-flash` -> `deepseek-v4-flash`).
- **Dynamic Limits**: Manages configurable context and output limits per environment.
- **Reasoning**: `reasoning_effort: "max"` by default on both models.
- **Message Truncation**: Trims messages to fit the 872K token context window.

### `cacheService.ts`

**Responsibility**: Persistent storage of multimodal content descriptions.

- **Backend**: Filesystem (JSON).
- **TTL**: Configurable (default 7 days).
- Avoids unnecessary API quota spending by reusing descriptions for identical content (based on SHA-256 hash).

### `anthropicAdapter.ts`

**Responsibility**: Bidirectional translation between Anthropic (Claude Code) and OpenAI (DeepSeek) formats.

- Converts `/v1/messages` (Anthropic) requests to `/v1/chat/completions` (OpenAI).
- Converts OpenAI responses to Anthropic format.
- Supports SSE streaming in both formats.
- Maps Claude models (`haiku`, `sonnet`, `opus`) to proxy models.
