# ROADMAP — DeepSeek Multimodal Proxy

## Current State: v2.0.0

| Métrica | Valor |
|---|---|
| Version | 2.0.0 |
| Tests | 88 unitarios (59% cobertura) |
| CI | Ubuntu + Windows, PR validation automática |
| Docker | Compose con `restart: always`, healthcheck |
| Brain | DeepSeek V4 Flash + Pro, `reasoning_effort: max` |
| Senses | Gemini 2.5 Flash (imagen + audio + video) |
| Context / Output | 872K / 384K (128K slack para headers) |
| Cache | SHA-256 contextual, 7 días TTL |

---

## Completed

### Core
- [x] Arquitectura "Cortex Sensorial v2": DeepSeek V4 + Gemini 2.5 Flash
- [x] DeepSeek V4 Flash y Pro con `reasoning_effort: max`
- [x] Soporte multimodal completo: imagen, audio, video, PDF, documentos
- [x] Rename modelos proxy: `-flash`, `-pro`, `vision-direct`
- [x] Rename estrategias: `needsGemini` → `needsVision`, `getGeminiRequiredContent` → `getVisionRequiredContent`, `gemini-direct` → `vision-direct`
- [x] Contexto 872K (1M nativo - 128K slack para headers de OpenCode/Claude Code)
- [x] Output 384K (máximo de DeepSeek V4)

### Code Quality
- [x] Extract `buildPayload()` — elimina duplicación en createChatCompletion y chatCompletionStream
- [x] Extract `extractAssistantContent()` — elimina triplicación en index.ts
- [x] Fix `onEnd()` double-call en streaming SSE (`safeEnd` con flag `streamEnded`)
- [x] Validar `reasoning_effort` — solo acepta `"high"` o `"max"`, fallback a `"max"`
- [x] `mapModel` con match exacto (`===`) en vez de `includes("pro")`
- [x] Eliminar `_messages` sin usar del signature de `createChatCompletion`
- [x] Eliminar `needsVision` no usado de `ContentAnalysis`
- [x] Remove dead code: `imageDetector.ts` (reemplazado por `multimodalDetector.ts`)
- [x] Remove Qwen integration (`qwenService.ts`) — evaluado y revertido a Gemini
- [x] ESLint configurado, 0 errores
- [x] TypeScript strict mode en CI

### Testing
- [x] 88 tests unitarios con Vitest
- [x] Cobertura de código con `@vitest/coverage-v8` (lcov + html + text)
- [x] Tests para multimodalDetector (17 tests)
- [x] Tests para multimodalProcessor con mocks (13 tests)
- [x] Tests para anthropicAdapter (15 tests)
- [x] Tests para cacheService, hashGenerator, error, imageProcessor, pdfProcessor, downloader

### CI/CD
- [x] GitHub Actions: PR validation en ubuntu + windows
- [x] CI/CD pipeline en push a main/develop
- [x] Deduplicación de workflows (PR ya no dispara ci.yml)
- [x] Validación de coverage report en CI
- [x] Fix `lcov` reporter en vitest.config.ts

### Docker
- [x] Multi-stage Dockerfile (Node 20 alpine)
- [x] Docker Compose con `.env`, healthcheck, volumen para cache
- [x] `restart: always` — auto-inicio con el sistema y auto-reinicio

### Seguridad
- [x] `.env` en `.gitignore` (nunca commiteado)
- [x] API keys validadas en constructor con error descriptivo
- [x] `@google/generative-ai` SDK para Gemini (autenticación nativa)

### Documentación
- [x] README completo: arquitectura, instalación, OpenCode, Claude Code, routing, métricas
- [x] MODELS.md actualizado con specs de V4, precios combinados, matrices de routing
- [x] CLAUDE.md con reglas del proyecto (idioma, arquitectura, convenciones, prohibiciones)
- [x] `.env.example` con todas las variables documentadas
- [x] Pricing actualizados con peor caso combinado (Gemini + DeepSeek)

### Claude Code / Anthropic
- [x] Adapter Anthropic ↔ OpenAI en `anthropicAdapter.ts`
- [x] Mapeo: haiku → vision-direct, sonnet → flash, opus → pro
- [x] Streaming Anthropic SSE desde chunks OpenAI
- [x] Deduplicación in-flight + cache de respuestas Anthropic
- [x] Tipos extendidos: input_audio, clipboard, file, thinking blocks

### PDF / Documents
- [x] Procesamiento híbrido: local (<1MB) con pdf-parse/pdf2json, Gemini (>1MB)
- [x] Fallback automático: local falla → Gemini
- [x] Validación Content-Type real antes de descargar

### Cache
- [x] SHA-256 contextual (contenido + pregunta del usuario)
- [x] Persistencia en disco (`./cache/descriptions.json`)
- [x] TTL y max entries configurables

### Streaming
- [x] SSE streaming nativo (OpenAI + Anthropic)
- [x] Buffer para chunks incompletos
- [x] Manejo de JSON mal formado en stream

### Bugs Corregidos
- [x] AI_JSONParseError en streaming SSE (chunks incompletos)
- [x] `onEnd()` doble en stream handler
- [x] `coverage/lcov.info` no generado en CI

---

## Short-term — v2.1.0

### Testing
- [ ] Coverage de 59% a 70%+: tests para `buildPayload`, `extractAssistantContent`, `safeEnd`
- [ ] Tests de integración para modelos nuevos (V4 Flash/Pro con API real)
- [ ] Tests de edge cases: mensajes vacíos, overflow de max_tokens, streams concurrentes
- [ ] Test del handler de error de streaming

### Refactor
- [ ] Split `src/index.ts` (848 líneas) en `src/routes/chat.ts` + `src/routes/anthropic.ts`
- [ ] Extraer lógica de deduplicación Anthropic a `src/services/dedupService.ts`
- [ ] Crear `src/types/strategy.ts` para tipos compartidos de estrategia

### CI/CD
- [ ] `npm audit fix` — resolver vulnerabilidades en dependencias
- [ ] Test con Node 22 (Node 20 deprecado en GitHub Actions Sep 2026)
- [ ] Build y push de imagen Docker a GHCR en cada tag

### Observabilidad
- [ ] `X-Request-ID` en todas las respuestas
- [ ] Métricas de tokens por estrategia: `X-Tokens-Gemini`, `X-Tokens-DeepSeek`
- [ ] `/health` extendido: uptime, requests/min, cache hit rate, memoria

---

## Medium-term — v2.2.0

### Features
- [ ] Rate limiting por IP (evitar sobrecostes)
- [ ] Toggle de thinking por request (permitir desactivar `reasoning_effort`)
- [ ] Fallback automático: DeepSeek falla → Gemini direct
- [ ] Dashboard web simple: stats de cache, uso de modelos, logs recientes

### Performance
- [ ] Reemplazar estimación `chars/3` con `tiktoken` o tokenizer nativo de DeepSeek
- [ ] Axios connection pooling + retry con backoff
- [ ] PDF download + procesamiento en pipeline paralelo

### Arquitectura
- [ ] Sistema de plugins para proveedores de visión (cambiar Gemini por otro vía config)
- [ ] Redis como backend de cache (soporte multi-instancia)
- [ ] Códigos de error estructurados (no solo strings)

---

## Long-term — v2.3.0+

- [ ] OpenAPI/Swagger spec autogenerada desde rutas
- [ ] Streaming de audio en tiempo real (voz → DeepSeek)
- [ ] Correlación multi-archivo (cross-reference entre documentos en un request)
- [ ] OCR local con Tesseract.js para PDFs escaneados (sin costo de API)
- [ ] Endpoint gRPC para servicios internos de alto throughput
- [ ] Modo multi-tenant con API keys y cuotas por tenant
- [ ] Métricas de costo en headers (`X-Cost-Estimated`)
- [ ] Documentación técnica completa: guía de arquitectura, contribución, ejemplos avanzados
