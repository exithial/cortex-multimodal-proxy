# ROADMAP — DeepSeek Multimodal Proxy

> **Compatibility constraint**: Every feature, refactor, and dependency change MUST preserve full compatibility with OpenCode and Claude Code as clients. No breaking changes to `/v1/chat/completions` (OpenAI-compatible) or `/v1/messages` (Anthropic-compatible) without explicit opt-in via header. Rate limiting and fallback mechanisms must have localhost bypass.

## Current State: v3.3.0

| Metric | Value |
|---|---|
| Version | 3.0.0 |
| Tests | 131 unit (full coverage of services + middleware) |
| CI | Ubuntu + Windows, automatic PR validation |
| Docker | Compose with `restart: always`, healthcheck |
| Brains | glm-5.2, deepseek-v4-pro (max thinking, OpenCode Go) |
| Passthrough | mimo-v2.5 (natively multimodal) |
| Senses | MiMo V2.5 (image) + Gemini fallback (audio/video/PDF, optional) |
| Context / Output | 819200 / 384000 (200K slack for MiMo image descriptions) |
| Cache | SHA-256 contextual, 7 days TTL |

---

## Completed

### Core
- [x] "Sensory Cortex v2" architecture: DeepSeek V4 + Gemini 2.5 Flash
- [x] DeepSeek V4 Flash and Pro with `reasoning_effort: max`
- [x] Full multimodal support: image, audio, video, PDF, documents
- [x] Rename proxy models: `-flash`, `-pro`, `vision-direct`
- [x] Rename strategies: `needsGemini` -> `needsVision`, `getGeminiRequiredContent` -> `getVisionRequiredContent`, `gemini-direct` -> `vision-direct`
- [x] Context 872K (1M native - 128K slack for OpenCode/Claude Code headers)
- [x] Output 384K (DeepSeek V4 max)

### Code Quality
- [x] Extract `buildPayload()` — removes duplication in createChatCompletion and chatCompletionStream
- [x] Extract `extractAssistantContent()` — removes triplication in index.ts
- [x] Fix `onEnd()` double-call in SSE streaming (`safeEnd` with `streamEnded` flag)
- [x] Validate `reasoning_effort` — only accepts `"high"` or `"max"`, fallback to `"max"`
- [x] `mapModel` with exact match (`===`) instead of `includes("pro")`
- [x] Remove unused `_messages` from `createChatCompletion` signature
- [x] Remove unused `needsVision` from `ContentAnalysis`
- [x] Remove dead code: `imageDetector.ts` (replaced by `multimodalDetector.ts`)
- [x] Remove Qwen integration (`qwenService.ts`) — evaluated and reverted to Gemini
- [x] ESLint configured, 0 errors
- [x] TypeScript strict mode in CI

### Testing
- [x] 88 unit tests with Vitest
- [x] Code coverage with `@vitest/coverage-v8` (lcov + html + text)
- [x] Tests for multimodalDetector (17 tests)
- [x] Tests for multimodalProcessor with mocks (13 tests)
- [x] Tests for anthropicAdapter (15 tests)
- [x] Tests for cacheService, hashGenerator, error, imageProcessor, pdfProcessor, downloader

### CI/CD
- [x] GitHub Actions: PR validation on ubuntu + windows
- [x] CI/CD pipeline on push to main/develop
- [x] Workflow deduplication (PR no longer triggers ci.yml)
- [x] Coverage report validation in CI
- [x] Fix `lcov` reporter in vitest.config.ts

### Docker
- [x] Multi-stage Dockerfile (Node 20 alpine)
- [x] Docker Compose with `.env`, healthcheck, volume for cache
- [x] `restart: always` — auto-start with system and auto-restart

### Security
- [x] `.env` in `.gitignore` (never committed)
- [x] API keys validated in constructor with descriptive error
- [x] `@google/generative-ai` SDK for Gemini (native authentication)

### Documentation
- [x] Complete README: architecture, installation, OpenCode, Claude Code, routing, metrics
- [x] MODELS.md updated with V4 specs, combined pricing, routing matrices
- [x] CLAUDE.md with project rules (language, architecture, conventions, prohibitions)
- [x] `.env.example` with all variables documented
- [x] Pricing updated with combined worst case (Gemini + DeepSeek)

### Claude Code / Anthropic
- [x] Anthropic <-> OpenAI adapter in `anthropicAdapter.ts`
- [x] Mapping: haiku -> vision-direct, sonnet -> flash, opus -> pro
- [x] Anthropic SSE streaming from OpenAI chunks
- [x] In-flight deduplication + Anthropic response cache
- [x] Extended types: input_audio, clipboard, file, thinking blocks

### PDF / Documents
- [x] Hybrid processing: local (<1MB) with pdf-parse/pdf2json, Gemini (>1MB)
- [x] Automatic fallback: local fails -> Gemini
- [x] Real Content-Type validation before download

### Cache
- [x] Contextual SHA-256 (content + user question)
- [x] Disk persistence (`./cache/descriptions.json`)
- [x] Configurable TTL and max entries

### Streaming
- [x] Native SSE streaming (OpenAI + Anthropic)
- [x] Buffer for incomplete chunks
- [x] Malformed JSON handling in stream

### Bugs Fixed
- [x] AI_JSONParseError in SSE streaming (incomplete chunks)
- [x] `onEnd()` double-call in stream handler
- [x] `coverage/lcov.info` not generated in CI
- [x] Undefined `error` variable in test-master.js:142
- [x] Outdated model name `deepseek-multimodal-chat` -> `deepseek-multimodal-flash` (10 occurrences)
- [x] Stale middleware README (referenced deleted `imageDetector.ts`)
- [x] Stale services README (referenced outdated model names and methods)
- [x] Pricing inconsistency between README and MODELS.md
- [x] Pricing updated to verified official API rates

---

## Short-term — v2.1.0

### Testing
- [ ] Coverage from 59% to 70%+: tests for `buildPayload`, `extractAssistantContent`, `safeEnd`
- [ ] Unit tests for `geminiService.ts` (537 lines, 0 tests) and `deepseekService.ts` (268 lines, 0 tests)
- [ ] Integration tests for new models (V4 Flash/Pro with real API)
- [ ] Edge case tests: empty messages, max_tokens overflow, concurrent streams
- [ ] Streaming error handler test

### Refactor
- [ ] Split `src/index.ts` (736 lines) into `src/routes/chat.ts` + `src/routes/anthropic.ts`
- [ ] Extract Anthropic deduplication logic to `src/services/dedupService.ts`
- [ ] Create `src/types/strategy.ts` for shared strategy types
- [ ] Fix Anthropic streaming: `openaiChunksGenerator()` accumulates all chunks in memory before streaming to adapter (defeats streaming purpose)
- [ ] Add `"type": "module"` to package.json (fixes `MODULE_TYPELESS_PACKAGE_JSON` warning on lint). ⚠️ Must verify OpenCode + Claude Code compatibility after migration.

### Operations
- [ ] Graceful shutdown: drain active connections before `process.exit()` on SIGTERM/SIGINT (critical for Docker zero-downtime)
- [ ] Startup env var validation: fail fast with clear error if `DEEPSEEK_API_KEY` or `GEMINI_API_KEY` missing
- [ ] Translate `.env.example` comments to English (currently Spanish — contradicts CLAUDE.md)
- [ ] Add pre-commit hooks (husky + lint-staged) for lint and typecheck gates

### CI/CD
- [ ] `npm audit fix` — resolve dependency vulnerabilities
- [ ] Test with Node 22 (Node 20 deprecated in GitHub Actions Sep 2026)
- [ ] Build and push Docker image to GHCR on each tag

### Observability
- [ ] `X-Request-ID` on all responses
- [ ] Structured JSON logging (winston already installed, just needs JSON format for ELK/Datadog)
- [ ] Token metrics per strategy: `X-Tokens-Gemini`, `X-Tokens-DeepSeek`
- [ ] Extended `/health`: uptime, requests/min, cache hit rate, memory

---

## Medium-term — v2.2.0

### Features
- [ ] Rate limiting per IP (prevent cost overruns). ⚠️ Must bypass localhost/127.0.0.1 to not throttle OpenCode/Claude Code.
- [ ] Thinking toggle per request (allow disabling `reasoning_effort`). ⚠️ Must be opt-in via explicit header (`X-DeepSeek-Reasoning: off`), default stays `max`.
- [ ] Automatic fallback: DeepSeek fails -> Gemini direct. ⚠️ Must be opt-in via header (`X-Fallback-Gemini: true`), return warning header so clients know response is degraded.
- [ ] Simple web dashboard: cache stats, model usage, recent logs
- [ ] CORS configuration (needed for web dashboard to call proxy from browser)
- [ ] Response compression: gzip/brotli for large responses (descriptions + streaming)

### Performance
- [ ] Replace `chars/3` estimation with `tiktoken` or native DeepSeek tokenizer
- [ ] Axios connection pooling + retry with backoff
- [ ] PDF download + processing in parallel pipeline
- [ ] Disk cache with write-locking: concurrent `fs.writeFile` can corrupt `descriptions.json`

### Resilience
- [ ] Circuit breaker for downstream APIs (DeepSeek/Gemini): stop retrying when service is down
- [ ] Request timeout configuration: prevent hanging streams from blocked clients
- [ ] Propagate `X-Request-ID` to DeepSeek and Gemini for end-to-end tracing

### Architecture
- [ ] Plugin system for vision providers (swap Gemini for another via config)
- [ ] Redis as cache backend (multi-instance support)
- [ ] Structured error codes (not just strings)

---

## Long-term — v2.3.0+

- [ ] Auto-generated OpenAPI/Swagger spec from routes
- [ ] Real-time audio streaming (voice -> DeepSeek)
- [ ] Multi-file correlation (cross-reference between documents in a request)
- [ ] Local OCR with Tesseract.js for scanned PDFs (no API cost)
- [ ] gRPC endpoint for high-throughput internal services
- [ ] Multi-tenant mode with API keys and per-tenant quotas
- [ ] Cost metrics in headers (`X-Cost-Estimated`)
- [ ] Complete technical documentation: architecture guide, contribution, advanced examples
