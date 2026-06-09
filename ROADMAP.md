# ROADMAP — DeepSeek Multimodal Proxy

## Current State: v2.0.0 — Production Ready

- DeepSeek V4 Flash + Pro with `reasoning_effort: max`
- Gemini 2.5 Flash for multimodal perception (image, audio, video)
- 88 unit tests (59% coverage)
- CI/CD on ubuntu + windows, Docker Compose
- Context: 872K, Output: 384K

---

## Short-term (v2.1.0)

### Testing
- [ ] Coverage from 59% to 70%+: test `buildPayload`, `extractAssistantContent`, `safeEnd` stream handler
- [ ] Integration tests for V4 Flash/Pro with real API
- [ ] Test edge cases: empty messages, max token overflow, concurrent streams

### Refactor
- [ ] Split `src/index.ts` (848 lines) into `src/routes/chat.ts` + `src/routes/anthropic.ts`
- [ ] Extract Anthropic deduplication logic into `src/services/dedupService.ts`
- [ ] Create `src/types/strategy.ts` for shared strategy types

### CI/CD
- [ ] Run `npm audit fix` to resolve dependency warnings
- [ ] Test with Node 22 (Node 20 deprecated in GH Actions by Sep 2026)
- [ ] Add Docker image build to CI pipeline
- [ ] Publish Docker image to GHCR on tag

### Observability
- [ ] Inject `X-Request-ID` header on all responses
- [ ] Track token usage per strategy (`X-Tokens-Gemini`, `X-Tokens-DeepSeek`)
- [ ] Add `/health` metrics: uptime, requests/min, cache hit rate

---

## Medium-term (v2.2.0)

### Features
- [ ] Rate limiting per IP (prevent cost overruns)
- [ ] Per-request thinking toggle: allow disabling `reasoning_effort` via request param
- [ ] Model fallback: if DeepSeek fails, try Gemini direct
- [ ] Web dashboard: cache stats, request logs, model usage graphs

### Performance
- [ ] Replace `chars/3` token estimate with `tiktoken` or DeepSeek tokenizer
- [ ] Add axios connection pooling and retry with backoff
- [ ] Parallel PDF download + processing pipeline

### Architecture
- [ ] Plugin system for vision providers (swap Gemini for others via config)
- [ ] Redis cache backend for multi-instance deployments
- [ ] Structured error codes (not just strings)

---

## Long-term (v2.3.0+)

- [ ] OpenAPI/Swagger spec auto-generated from routes
- [ ] Streaming audio transcription (real-time voice -> DeepSeek)
- [ ] Multi-file correlation (cross-reference multiple documents in one request)
- [ ] Local OCR with Tesseract.js for scanned PDFs (no API cost)
- [ ] gRPC endpoint for high-throughput internal services
- [ ] Multi-tenant mode with per-tenant API keys and quota tracking

---

## Completed

### v2.0.0
- [x] DeepSeek V4 Flash + Pro with `reasoning_effort: max`
- [x] Gemini 2.5 Flash as primary vision model
- [x] Rename models: `-flash`, `-pro`, `vision-direct`
- [x] Context 872K / Output 384K with 128K slack
- [x] Extract `buildPayload()` and `extractAssistantContent()` helpers
- [x] Fix `onEnd()` double-call in SSE stream handler
- [x] Validate `reasoning_effort` env var
- [x] Remove dead code (imageDetector, Qwen integration)
- [x] Docker `restart: always` for auto-start
- [x] CI deduplication (single PR workflow)
- [x] CLAUDE.md with project conventions
- [x] Comprehensive README rewrite

### v1.8.0
- [x] 103 unit tests, 64% coverage
- [x] ESLint + CI/CD pipeline
- [x] Claude Code Anthropic adapter
- [x] PDF hybrid processing (local + Gemini)
- [x] SHA-256 contextual cache
- [x] Streaming SSE support
