# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Pluggable brain and vision providers via `BRAIN_MODE`** (PR #9). New env var selects between four modes:
  - `auto` (default) — picks `deepseek` if `DEEPSEEK_API_KEY` is set, else `opencode` if `OPENCODE_GO_API_KEY` is set; warns and proceeds if both are set.
  - `opencode` — only the 4 OpenCode Go brains (`proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro`) plus MiMo V2.5 vision.
  - `deepseek` — only DeepSeek V4 Pro/Flash brains under their standard IDs (`proxy/deepseek-v4-{pro,flash}`) plus MiniMax M3 vision (requires `MINIMAX_API_KEY`).
  - `hybrid` — both providers active: OpenCode Go brains under `proxy/<id>`, user's DeepSeek under `proxy/local-deepseek-v4-{pro,flash}`.
- **New provider interfaces**:
  - `BrainProvider` (`src/services/brainProvider.ts`) — text-only chat completion abstraction with per-entry `providerName` discriminator for hybrid routing.
  - `VisionProvider` (`src/services/visionProvider.ts`) — multimodal content description with `supportsContentType("image" | "video")` gate.
- **New provider implementations**:
  - `OpenCodeGoBrainProvider` (renamed from `opencodeGoService`) — generic OpenCode Go caller, used in `opencode`/`hybrid`.
  - `DeepSeekBrainProvider` — direct DeepSeek V4 Pro/Flash via `https://api.deepseek.com/v1/chat/completions`, OpenAI-compatible, OpenCode-style retries (3 attempts, 2s/4s delays on 503/502/429).
  - `MimoSensesVisionProvider` (renamed from `mimoSensesService`) — MiMo V2.5 image description via OpenCode Go.
  - `MiniMaxM3Provider` — Anthropic-format chat + image/video vision passthrough (`https://api.minimax.io/anthropic/v1/messages`), no thinking block, single `x-api-key` auth header.
- **Runtime brain registry** in `src/services/brainRegistry.ts`: `BRAIN_MODELS_BASE` (4 OpenCode Go brains), `PASSTHROUGH_MODELS = { mimo-v2.5, MiniMax-M3 }`, runtime `registerBrainEntry()`, `parseLocalProxyModelId()` with registry validation.
- **Provider selector** in `src/services/providerSelector.ts`: `BRAIN_MODE` resolver, per-entry routing via `entry.providerName`, mode-aware model filtering, mode-aware passthrough exposure in `/v1/models`.
- **Two OpenCode TUI templates** committed (both stable):
  - `opencode.json` — OpenCode Go flavor (5 entries: 4 brains + `mimo-v2.5` passthrough).
  - `opencode.deepseek.json` — DeepSeek flavor (3 entries: 2 brains + `MiniMax-M3` passthrough).
  - `scripts/select-opencode-config.sh` is informational and never mutates state.
- **Shared converters**: `anthropicPayloadConverter.ts` (OpenAI→Anthropic payload, used by `OpenCodeGoBrainProvider` and `MiniMaxM3Provider`) and `anthropicStreamConverter.ts` (Anthropic SSE → OpenAI streaming chunks).

### Changed

- **Multimodal pipeline** (`src/middleware/multimodalProcessor.ts`) accepts a `VisionProvider` and dispatches on `supportsContentType` with Gemini fallback. `parseLocalProxyModelId` now validates the parsed upstream against the registry; unknown `proxy/local-*` IDs return null instead of leaking to provider routing.
- **DeepSeek pricing** reflects the post-June 2026 price cut: $0.435 input / $0.87 output per 1M tokens (was $1.74 / $3.48 pre-cut).
- **Docker** (`compose.yml`): default to bridge networking with explicit port mapping; host-mode option left as a single commented line for advanced setups (no public networking details leaked).
- **Env validation** moved into provider constructors; each provider singleton is `process.env.KEY ? new Provider() : null`, so `BRAIN_MODE=opencode` users no longer crash on missing `DEEPSEEK_API_KEY` and vice versa.
- **`.env.example`**: `SENSES_MODEL` default restored to `mimo-v2.5` so a fresh install with `BRAIN_MODE=auto` + only `OPENCODE_GO_API_KEY` resolves correctly to the MiMo senses provider.

### Backward compatibility

- `BRAIN_MODE=auto` with only `OPENCODE_GO_API_KEY` set preserves byte-for-byte the v3.1.0 public contract: same 4 brains, same passthrough (`mimo-v2.5`), same `/v1/models` listing, same Anthropic SSE → OpenAI streaming conversion.

## [3.1.0] - 2026-07-14

### Added

- **Two new text-only brains via OpenCode Go**:
  - `proxy/qwen3.7-max` — Qwen flagship, Anthropic-format (`/v1/messages`), 1M upstream context (clients see 800K auto-compact target — see CLAUDE.md § "Brain context window policy"), 65K output, $2.50 input / $7.50 output per 1M tokens. Combined with MiMo senses: **$2.64 / $7.78** per 1M.
  - `proxy/mimo-v2.5-pro` — Xiaomi "Pro" tier, OpenAI-format (`/v1/chat/completions`), 1M upstream context (clients see 800K auto-compact target), 65K output, $1.74 input / $3.48 output per 1M tokens. Combined with MiMo senses: **$1.88 / $3.76** per 1M.
- Both new brains gain image vision automatically through the existing MiMo V2.5 senses layer (no `multimodalProcessor` change needed — vision routing is keyed off the `proxy/` prefix).
- Coexistence with the existing `mimo-v2.5` passthrough preserved (no replacement; clients choose either).
- `opencode.json` updated with the two new brains (cost, limit, modalities) so OpenCode clients see them in `/v1/models`. `limit.context` is set to **800K** for both (the client-visible auto-compact target), even though the upstream accepts 1M — see the brain context window policy.

### Changed

- **All 4 brains now configured with `context: 1_048_576` (1M) in `brainRegistry.ts`** — matching the real upstream limit. GLM-5.2 and DeepSeek V4 Pro were previously at 819200 (800K) despite accepting 1M natively; updated to match Qwen3.7 Max and MiMo V2.5 Pro. The proxy now sends up to 1M to all brains via `truncateMessages`.
- **Brain context window policy formalized in CLAUDE.md**: distinguishes `BrainModelEntry.context` (real upstream limit) from `limit.context` in `opencode.json` and docs (client-visible auto-compact target, 800K for all MiMo-senses brains). The 200K gap is mandatory headroom so the proxy can inject MiMo senses image descriptions without racing the upstream's hard cap.

## [3.0.0] - 2026-07-07

### Added

- **Cortex Sensorial v3 architecture**: 2 text-only brains via OpenCode Go subscription (`proxy/glm-5.2`, `proxy/deepseek-v4-pro`) plus 1 natively multimodal passthrough (`mimo-v2.5`). Single Bearer token for all upstream models.
- **MiMo V2.5 multimodal senses**: dedicated image-description pipeline replaces Gemini 2.5 Flash for the vision flow. Significantly cheaper ($0.14 input / $0.28 output per 1M tokens) and tuned with a Spanish-language technical prompt.
- **OpenCode Go client service**: new `opencodeGoService` supports both `/chat/completions` (OpenAI-format, Bearer auth) and `/messages` (Anthropic-format, `x-api-key` + `anthropic-version: 2023-06-01`) endpoints, with retry, exponential backoff, and SSE buffering.
- **Brain registry**: single source of truth (`brainRegistry.ts`) for brain and passthrough entries, including per-brain `endpoint` (openai|anthropic), `context`, `maxOutput`, `thinking` flag, pricing, and `multimodal` flag. Uses `Object.hasOwn()` for prototype-safe lookups.
- **Shared message transforms**: `prepareMessages` (filter valid roles, normalize content, preserve `tool_calls` / `reasoning_content`) and `truncateMessages` (token-aware trim to fit per-brain context) extracted into `messageTransforms.ts`.
- **Retry with exponential backoff**: 3 attempts with 2s/4s delays on upstream 503/502/429, respecting the `Retry-After` header.
- **SSE streaming hardening**: line-buffer + `safeEnd` guard prevents double-end stream bugs and `data: [DONE]` mishandling.
- **Claude Code compat**: `/v1/messages` route maps `haiku` → `mimo-v2.5` (passthrough), `sonnet` → `proxy/deepseek-v4-pro`, `opus` → `proxy/glm-5.2` (configurable via `CLAUDE_HAIKU_MODEL`, `CLAUDE_SONNET_MODEL`, `CLAUDE_OPUS_MODEL`).
- **`vision-mimo` routing strategy**: when a text-only brain receives an image, the image is described by MiMo V2.5 and the description is forwarded to the brain.
- **OpenCode CLI compat**: `/v1/models` lists 2 brain models + 1 passthrough; usable as `provider` in `~/.config/opencode/opencode.json` for OpenCode subscribers.
- **Unit tests**: 131 unit tests covering `opencodeGoService` (retry, SSE buffering, OpenAI/Anthropic translation, tools), `brainRegistry`, `mimoSensesService`, `multimodalProcessor` (passthrough + vision-mimo + Gemini fallback).
- **Docs**: `CLAUDE.md`, `README.md`, `MODELS.md`, `src/services/README.md`, `src/middleware/README.md` rewritten to reflect v3 architecture and Claude Code mappings.

### Changed

- **Project renamed**: `deepseek-multimodal-proxy` (v2.0.0) → `cortex-multimodal-proxy` (v3.0.0). Container name, `/health` `service`, scripts, and all documentation reflect the new name.
- **GitHub repo renamed** from `exithial/deepseek-multimodal-proxy` to `exithial/cortex-multimodal-proxy`. Origin URL, badges, clone commands, and CI workflow references all updated.
- **Default context limit raised to 819200** (800K with 200K headroom for MiMo V2.5 image descriptions) for both brains.
- **Max thinking always-on**: every brain request includes `thinking: { type: "enabled" }` for maximum reasoning quality.
- **`/v1/models` is now context-aware**: returns the Claude Code aliases (`haiku`/`sonnet`/`opus`) when the Anthropic `anthropic-version` header is present, otherwise returns the proxy brains for OpenCode.
- **Anthropic payload translation** happens in `opencodeGoService` instead of being scattered across handlers. OpenAI tools and tool_calls are translated to Anthropic `tool_use` / `tool_result` blocks when a brain's `endpoint === "anthropic"`.

### Removed

- **DeepSeek V4 client**: `deepseekService.ts` deleted (replaced by `opencodeGoService` + `messageTransforms`).
- **`vision-direct` strategy**: legacy "Gemini-direct bypass" removed now that `haiku` maps to the mimo-v2.5 passthrough. `vision-direct` test cases removed from integration tests.
- **`deepseek-v4-flash` model**: replaced by `proxy/deepseek-v4-pro`. Tests updated to the surviving brain model.

### Fixed

- **SSE double-end bug**: streaming responses could write `[DONE]` twice on retry/race conditions; `safeEnd` flag ensures single terminal callback.
- **Anthropic auth header**: `x-api-key` + `anthropic-version` required (verified empirically against OpenCode Go Anthropic endpoint); Bearer auth caused silent 401s.
- **Prototype pollution risk** in model registry lookups: switched from direct `BRAIN_MODELS[id]` to `Object.hasOwn()` for safe access on untrusted model id input.
- **CI badge and shields.io links** pointing to the old GitHub repository name (post-rename) updated to `exithial/cortex-multimodal-proxy`.

## [1.8.0] - 2026-04-12

### Added

- **Soporte nativo para Windows**: Nuevos scripts PowerShell para `setup`, `manage` y `run-local`, con wrappers Node multiplataforma para mantener una única interfaz de comandos.
- **Operación con Docker Compose**: Añadidos `Dockerfile`, `compose.yml` y `.dockerignore` para despliegue consistente con autoarranque mediante `restart: unless-stopped`.
- **Comandos Docker en NPM**: Nuevos scripts `docker:build`, `docker:up`, `docker:down`, `docker:logs` y `docker:ps`.

### Changed

- **Scripts portables**: `package.json` ahora invoca binarios Node directamente para `build`, `lint` y `test`, evitando dependencias de wrappers específicos del sistema operativo.
- **Documentación operativa**: `README.md`, `TESTING.md` y `scripts/README.md` fueron actualizados para cubrir Windows, Docker y flujos multiplataforma.
- **CI/CD multiplataforma**: Los workflows de GitHub Actions ahora validan build y pruebas tanto en Ubuntu como en Windows.

### Fixed

- **Compatibilidad de dependencias en Windows**: Se eliminó la dependencia implícita de `node_modules` generados en Linux/WSL, permitiendo validación real en Windows tras reinstalar dependencias.
- **Gestión de procesos en Windows**: Corregido el tracking del proceso del proxy en entornos con `nvm`, usando detección robusta por puerto/PID efectivo.

## [1.7.2] - 2026-02-25

### Fixed

- **JSON Parsing en Streaming**: Corregido error crítico de parsing JSON incompleto en streaming SSE con buffer acumulativo y validación robusta de JSON.parse()

## [1.7.1] - 2026-02-13

### Changed

- **Lockfiles**: Restaurado `package-lock.json` para compatibilidad con CI/CD pipeline de GitHub Actions.

## [1.7.0] - 2026-02-14

### Fixed

- **Error reasoning_content en modelo reasoner**: Corregido error 400 de DeepSeek API que faltaba el campo `reasoning_content` en mensajes del asistente al reenviar historial de conversación.
- **Soporte bidireccional reasoning**: Ahora se mapea correctamente `thinking` blocks de Anthropic ↔ `reasoning_content` de DeepSeek.

### Added

- **ESLint configurado**: Configuración de ESLint con TypeScript para verificación de código. Scripts `lint` y `lint:fix` disponibles en package.json.

### Changed

- **Lockfiles**: Eliminado `package-lock.json`, solo `yarn.lock` queda en el proyecto.

### Removed

- **Warnings de variables no usadas**: Limpiados imports y variables no utilizadas en el código.

## [1.6.0] - 2026-02-13

### Added

- **Tests Unitarios con Vitest**: Implementación de suite completa de 103 tests unitarios con cobertura del 64% (statements), sin consumir cuota de APIs mediante mocks.
- **Framework de Testing**: Integración de Vitest como framework principal para testing con soporte de TypeScript.
- **Cobertura de Código**: Soporte para generación de reportes de cobertura con v8.
- **CI/CD Pipeline**: GitHub Actions workflows para automatización de tests y validación de tipos en cada push y PR.
  - Tests en múltiples versiones de Node.js (20, 22)
  - Validación de TypeScript strict mode
  - Generación automática de reportes de cobertura
- **Badge de CI**: Badge de estado del pipeline agregado al README.

### Changed

- **BACKLOG.md**: Reorganización de prioridades, moviendo testing y CI/CD a prioridad ALTA.
- **README.md**: Actualizado con comandos de testing y requisitos de Node.js >= 20.x.

### Fixed

- **.gitignore**: Agregadas carpetas de cobertura (`coverage/`, `.nyc_output/`, `.vitest/`) al gitignore.

## [1.5.1] - 2026-02-12

### Added

- **Soporte Gemini Direct**: Ahora el modelo `gemini-direct` es accesible directamente vía endpoint de OpenAI para bypass completo de DeepSeek.

## [1.5.0] - 2026-02-11

### Added

- **Routing Inteligente por Modelo**: Nueva función `getModelRoutingStrategy()` que enruta automáticamente `haiku` → `gemini-direct` y otros modelos → `deepseek-routing`.
- **Soporte Extendido de Tipos de Contenido**: Adición de tipos `input_audio`, `clipboard`, `file` en el adaptador Anthropic para compatibilidad completa con Claude Code.
- **Validación de Contenido Vacío**: Mejora en el manejo de texto vacío en el adaptador Anthropic para evitar errores de procesamiento.

### Changed

- **Optimización de Routing para Haiku**: Modelo `haiku` ahora usa estrategia `gemini-direct` para respuestas más rápidas, bypass total de DeepSeek.
- **Manejo Mejorado de Contenido Multimodal**: Procesamiento más robusto de arrays de contenido en estrategia `gemini-direct`.
- **Cache Diferenciada por Modelo**: Sistema de cache ahora distingue entre modelos para evitar contaminación cruzada.

### Fixed

- **Compatibilidad con Tipos de Contenido Claude**: Corrección en el adaptador Anthropic para manejar correctamente `input_audio`, `clipboard` y `file` con datos Base64.
- **Procesamiento de Texto Vacío**: Evita errores cuando el contenido de mensajes assistant está vacío en estrategia `gemini-direct`.

## [1.4.0] - 2026-02-11

### Added

- **Claude Code (Anthropic) API**: Soporte completo de `/v1/messages` con adaptador Anthropic y streaming SSE compatible.
- **Modelos Claude Simplificados**: Alias `haiku`, `sonnet`, `opus` para selección directa desde Claude Code.
- **Compatibilidad Multimodal Anthropic**: Soporte para `image`, `audio_url`, `video_url` y `document_url` en Claude.
- **Tests Claude Code**: Nueva suite `test/test-claude-code.js` con cobertura de texto, imagen, audio, video, PDF y streaming.
- **Limpieza de logs**: Nuevo comando `proxy:logs:clear` y opción `logs --clear`.

### Changed

- **Modelos Claude en /v1/models**: Respuesta para clientes Anthropic ahora expone `haiku`, `sonnet`, `opus`.

### Fixed

- **Dedupe de requests Anthropic**: Ventana corta para evitar duplicados del CLI y reducir costo.
- **Trazabilidad de requests**: Logs ahora incluyen `request_id` e `internal` para correlación.

## [1.3.1] - 2026-02-10

### Added

- **Unificación de Scripts**: Consolidación de múltiples scripts de gestión en `manage.sh` (start, stop, status, logs, uninstall).
- **Setup Simplificado**: El instalador principal ahora es `setup.sh` (anteriormente `setup-deepseek-proxy.sh`).
- **Integración NPM**: Nuevos comandos rápidos en `package.json` (`npm run setup`, `npm run status`, `npm run proxy:*`).

### Fixed

- **Persistencia de Servicio**: Corregida la detección de rutas reales de Node para evitar fallos por rutas temporales de Yarn en el servicio systemd (Error 203/EXEC).

## [1.3.0] - 2026-02-10

### Added

- **Multimodalidad Completa**: Soporte nativo para audio y video usando Gemini 2.5 Flash Lite.
- **Routing Inteligente**: Nuevo sistema de detección (`multimodalDetector.ts`) que clasifica contenido en 8 tipos (incluyendo soporte robusto para Data URIs/Base64).
- **Suite de Pruebas Maestra**: Nuevo script `test/test-master.js` para validación automatizada de todas las trayectorias de routing (Text, Image, Audio, Video, PDF, Base64, Streaming).
- **Procesamiento de Documentos**: Soporte para análisis de documentos (Word, Excel, PowerPoint) y PDFs vía Gemini API.
- **Procesamiento Local de PDF**: Extracción de texto local para PDFs pequeños (<1MB) para velocidad y privacidad.
- **Validación Proactiva**: Peticiones HEAD para validar tamaño de archivos (>50MB) antes de iniciar descargas.

### Fixed

- **Base64 Detection**: Corregido problema de routing donde las imágenes en Base64 se enviaban directamente a DeepSeek en lugar de Gemini.
- **Streaming Consistency**: Mejora en el cierre de streams SSE para asegurar compatibilidad total con el cliente de OpenCode.
- **Tipado TypeScript**: Actualizadas interfaces de `MessageContent` para incluir `input_audio` y otros tipos multimodales.

### Changed

- **Identidad del Proxy**: Renombrado de "Vision Proxy" a "Multimodal Proxy" para reflejar nuevas capacidades.
- **Integración Gemini**: Actualizado `geminiService.ts` para manejar múltiples tipos de contenido más allá de imágenes.
- **Lógica de Routing**: El passthrough a DeepSeek ahora es selectivo (solo texto/código), desviando todo el contenido multimedia a Gemini.
- **Manejo de PDFs**: Implementado sistema híbrido (Local para velocidad/privacidad, Gemini para complejidad/OCR).
- **Validación de Tamaño**: Implementadas requests HEAD previas a la descarga para rechazar archivos > 50MB tempranamente.

### Documentation

- **Guías**: Actualizados `README.md`, `MODELS.md` y `TESTING.md` con la nueva terminología multimodal.
- **Ejemplos**: Añadidos casos de uso para audio, video y documentos complejos.

## [1.2.5] - 2026-02-09

### Fixed

- **Script de Inicio**: Simplificado `start.sh` para configuración de servicio systemd.

## [1.2.4] - 2026-02-09

### Changed

- **Modelo Gemini Actualizado**: Cambiado de `gemini-2.5-flash` a `gemini-2.5-flash-lite` para análisis de imágenes más rápido y eficiente.
- **Configuración por Defecto**: Actualizados `.env.example` y `.env` con el nuevo modelo por defecto.
- **Documentación**: Actualizado `MODELS.md` para reflejar el cambio de modelo.

## [1.2.3] - 2026-02-09

### Fixed

- **Endpoint de Health**: Sincronizada la versión reportada en `/health` para que coincida dinámicamente con `package.json`.

## [1.2.2] - 2026-02-09

### Added

- **Configuración por Entorno**: Ahora los límites de tokens son totalmente configurables vía `.env` (`DEEPSEEK_CONTEXT_WINDOW_CHAT`, `DEEPSEEK_MAX_OUTPUT_CHAT`, etc.).
- **Límites Granulares**: Control independiente de ventana de contexto y salida para modelos Chat y Reasoner.

### Changed

- **Límites de Salida (Propuesta Captura)**: Aumentados para aprovechar al máximo los modelos (Chat: 8k, Reasoner: 64k).
- **Limpieza de Código**: Eliminadas todas las referencias residuales y comentarios legacy de Ollama en `deepseekService.ts` y documentación interna.

## [1.2.1] - 2026-02-09

### Changed

- **Límites de Salida (Output)**: Aumentados significativamente para aprovechar al máximo la capacidad de los modelos DeepSeek.
  - `DeepSeek Chat`: De 4k a **8k** tokens.
  - `DeepSeek Reasoner`: De 16k a **64k** tokens.
- **Documentación**: Actualizados `README.md` y `MODELS.md` con los nuevos límites y configuración recomendada para OpenCode.

## [1.2.0] - 2026-02-09

### Removed

- **Soporte Ollama**: Eliminada completamente la integración con Ollama. El proxy ahora es exclusivamente para DeepSeek con visión Gemini.
- **Modelos Locales**: Eliminados, ya no se redirigen peticiones a instancias locales.

## [1.1.1] - 2026-02-08

### Fixed

- **Compatibilidad OpenCode**: Corregido problema donde el modelo `qwen2.5:7b-instruct` no funcionaba correctamente en OpenCode, mostrando error "Unable to connect".
- **Streaming Ollama**: Solucionado problema donde OpenCode borraba mensajes después de que Ollama terminaba de responder. Ahora se envía correctamente el chunk final con `finish_reason: 'stop'`.
- **Doble Finalización**: Prevenida llamada duplicada a `onEnd()` en el streaming de Ollama mediante bandera `streamEnded`.

### Changed

- **Simplificación de Modelos Ollama**: Eliminada compatibilidad con `deepseek-coder` de Ollama. Ahora solo `qwen2.5:7b-instruct` está disponible como modelo local.
- **Mapeo de Modelos**: Actualizado para soportar directamente `qwen2.5:7b-instruct` (con dos puntos) para compatibilidad nativa con OpenCode.
- **Endpoint de Modelos**: Reducida lista de modelos expuestos en `/v1/models` para reflejar solo `qwen2.5:7b-instruct` y sus alias.

### Technical

- **Consistencia de Stream**: Implementado ID de stream consistente y timestamp fijo para todos los chunks de una misma respuesta.
- **Formato SSE Mejorado**: Streaming de Ollama ahora envía chunk final con `finish_reason: 'stop'` y `delta: {}` como espera OpenCode.

## [1.1.0] - 2026-02-07

### Added

- **Integración Ollama**: Soporte para modelos locales de Ollama (qwen2.5:7b-instruct y deepseek-coder:6.7b-instruct-q8_0) a través del proxy.
- **Enrutamiento Inteligente**: Sistema que detecta automáticamente si un request debe ir a DeepSeek o Ollama basado en el modelo solicitado.
- **Visión Unificada**: Todos los modelos (DeepSeek y Ollama) ahora se benefician del procesamiento de imágenes con Gemini.
- **Scripts de Automatización**: Sistema completo de scripts bash para instalación, verificación y desinstalación del proxy.
- **Servicio Systemd**: Configuración de inicio automático como servicio del sistema con reinicio automático.
- **Endpoint de Modelos Expandido**: Ahora expone 10 modelos (4 DeepSeek + 6 Ollama) con soporte de visión.

### Changed

- **Arquitectura Proxy**: Modificado para manejar múltiples proveedores (DeepSeek y Ollama) en un solo endpoint.
- **Configuración OpenCode**: Simplificada a 4 modelos principales con visión habilitada para todos.
- **Mapeo de Modelos**: Sistema mejorado que soporta alias y nombres cortos para mayor compatibilidad.
- **Manejo de Errores**: Mejorado para identificar y manejar procesos específicos sin interrumpir OpenCode.

### Fixed

- **Compatibilidad TypeScript**: Corregidos errores de tipos en el servicio de enrutamiento.
- **Permisos Systemd**: Solucionado problema de permisos y entorno para ejecución con nvm.
- **Detección de Procesos**: Scripts mejorados para no detener procesos de OpenCode en ejecución.

## [1.0.0] - 2026-02-06

### Added

- **Initial Release**: Launch of DeepSeek Vision Proxy, enabling vision capabilities for DeepSeek models via OpenAI-compatible API.
- **Vision Engine**: Integration with **Google Gemini 2.5 Flash** for high-speed, accurate image analysis.
- **Smart Caching**: Implemented SHA-256 contextual caching system (Image + User Prompt) to minimize API usage and latency.
- **Adaptive Prompting**: Dynamic prompt generation that injects user context into the vision analysis for more relevant descriptions.
- **Middleware**: Intelligent image detection supporting Base64 strings, URLs, and multipart requests.
- **API**: Full support for `chat/completions` with Server-Sent Events (SSE) streaming.
- **Tools Support**: Complete forward compatibility with OpenAI tools (`tools` and `tool_choice`).
- **Architecture**: Modular design with clean separation between DeepSeek passthrough and Vision processing services.
