# Servicios del Sistema

Este directorio contiene la logica de negocio core del proxy.

## Descripcion de Servicios

### `geminiService.ts`

**Responsabilidad**: Gestionar la interaccion con la API de Google Gemini para vision.

- **Funciones Principales**:
  - `analyzeContent(source, context, type)`: Orquesta el proceso de vision (hash -> cache -> api).
  - Soporta image, audio, video, PDF y texto.
  - Generacion de prompts adaptativos basados en el contexto del chat del usuario.
  - Utiliza `GEMINI_API_KEY` para autenticacion directa.
  - Cache SHA-256 contextual (imagen + pregunta) para evitar llamadas repetidas.

### `deepseekService.ts`

**Responsabilidad**: Intermediario con la API de DeepSeek V4.

- **Manejo de Completions**: Soporta tanto requests normales como streaming (SSE).
- **Procesamiento unificado**: Recibe mensajes procesados (media -> descripciones de texto).
- **Mapeo de modelos**: Convierte nombres de proxy a modelos destino (ej: `deepseek-multimodal-flash` -> `deepseek-v4-flash`).
- **Limites Dinamicos**: Gestiona limites de contexto y salida configurables por entorno.
- **Razonamiento**: `reasoning_effort: "max"` por defecto en ambos modelos.
- **Truncado de mensajes**: Recorta mensajes para ajustarse a la ventana de contexto de 872K tokens.

### `cacheService.ts`

**Responsabilidad**: Almacenamiento persistente de descripciones de contenido multimodal.

- **Backend**: Sistema de archivos (JSON).
- **TTL**: Configurable (default 7 dias).
- Evita gastos innecesarios de cuota API reutilizando descripciones para contenido identico (basado en hash SHA-256).

### `anthropicAdapter.ts`

**Responsabilidad**: Traduccion bidireccional entre formatos Anthropic (Claude Code) y OpenAI (DeepSeek).

- Convierte requests `/v1/messages` (Anthropic) a `/v1/chat/completions` (OpenAI).
- Convierte respuestas OpenAI a formato Anthropic.
- Soporta streaming SSE en ambos formatos.
- Mapea modelos Claude (`haiku`, `sonnet`, `opus`) a modelos del proxy.
