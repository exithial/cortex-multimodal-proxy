# DeepSeek Multimodal Proxy (Gemini Edition)

![License](https://img.shields.io/github/license/exithial/deepseek-multimodal-proxy?style=flat-square)
![Version](https://img.shields.io/github/package-json/v/exithial/deepseek-multimodal-proxy?style=flat-square)
![Node.js](https://img.shields.io/badge/node.js->=20.x-green?style=flat-square&logo=node.js)
![CI](https://github.com/exithial/deepseek-multimodal-proxy/workflows/CI%2FCD%20Pipeline/badge.svg)

Proxy HTTP OpenAI-compatible con arquitectura **"Cortex Sensorial v2"**: DeepSeek V4 como cerebro y Gemini 2.5 Flash como sistema de percepcion multimodal.

## Arquitectura "Cortex Sensorial v2"

- **DeepSeek V4 = Cerebro**: Logica, codigo, razonamiento puro (Flash + Pro con Max thinking)
- **Gemini 2.5 Flash = Sentidos**: Percepcion multimodal completa (imagen, audio, video, documentos, PDFs)
- **Proxy = Cortex**: Routing inteligente segun especialidad cognitiva

### Caracteristicas Principales

- **Routing Inteligente Automatico**: Detecta 8 tipos de contenido y decide routing optimo
- **Multimodalidad Completa**: Imagenes, audio, video, PDFs, documentos, codigo, texto
- **Modo Directo**: Usa `vision-direct` para bypassing DeepSeek con respuestas directas de Gemini
- **Procesamiento Hibrido de PDFs**: Local (<1MB) para velocidad o Gemini (>1MB) para calidad/OCR
- **Descarga Automatica con Validacion**: URLs con validacion Content-Type real y limite de 50MB
- **Cache Contextual SHA-256**: Hash unico por contenido + pregunta (evita re-procesamiento)
- **Streaming SSE**: Soporte nativo para respuestas en tiempo real
- **Optimizado para OpenCode**: Mapeo transparente de modalidades `text`, `image`, `audio`, `video`, `pdf`
- **DeepSeek V4 Max Thinking**: Ambos Flash y Pro con `reasoning_effort: "max"` para maxima calidad

## Requisitos

- **Node.js** >= 20.x (LTS)
- **DeepSeek API Key** (para razonamiento/texto)
- **Google Gemini API Key** (para percepcion multimodal)
- **Windows PowerShell 5.1+** o **bash** si usas scripts de gestion

## Compatibilidad de Plataforma

- **Windows nativo**: Mediante wrappers Node + scripts PowerShell
- **Linux**: Mediante scripts Bash + `systemd`
- **Docker / Docker Compose**: Windows, Linux y macOS
- **node_modules compartido entre SOs**: No recomendado; reinstala con `npm install` al cambiar de SO

## Instalacion Rapida

### Opcion 1: Script Automatico (Recomendado)

```bash
git clone https://github.com/exithial/deepseek-multimodal-proxy.git
cd deepseek-multimodal-proxy
npm install
npm run setup
```

Esto configura todo automaticamente: compila TypeScript, instala el servicio `systemd` (Linux) o inicia el proxy en segundo plano (Windows), y verifica disponibilidad.

### Opcion 2: Instalacion Manual

```bash
npm install
npm run build
cp .env.example .env
# Edita .env con tus API keys
npm run proxy:start
```

### Opcion 3: Docker Compose

```bash
npm run docker:build
npm run docker:up
```

Notas: Usa `.env` como configuracion del contenedor, publica puerto `7777`, persiste `cache/` en volumen Docker, arranca con `restart: always`.

## Integracion con OpenCode

Agrega a `~/.config/opencode/opencode.json`:

```json
{
  "provider": {
    "deepseek-multimodal": {
      "name": "DeepSeek Multimodal (Proxy v2)",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:7777/v1",
        "apiKey": "not-needed"
      },
      "models": {
        "deepseek-multimodal-flash": {
          "name": "deepseek-multimodal-flash",
          "cost": { "input": 0.44, "output": 2.78 },
          "limit": { "context": 872000, "output": 384000 },
          "modalities": {
            "input": ["text", "image", "audio", "video", "pdf"],
            "output": ["text"]
          }
        },
        "deepseek-multimodal-pro": {
          "name": "deepseek-multimodal-pro",
          "cost": { "input": 0.74, "output": 3.37 },
          "limit": { "context": 872000, "output": 384000 },
          "modalities": {
            "input": ["text", "image", "audio", "video", "pdf"],
            "output": ["text"]
          }
        },
        "vision-direct": {
          "name": "vision-direct",
          "cost": { "input": 0.30, "output": 2.50 },
          "limit": { "context": 1000000, "output": 65536 },
          "modalities": {
            "input": ["text", "image", "audio", "video", "pdf"],
            "output": ["text"]
          }
        }
      }
    }
  }
}
```

## Integracion con Claude Code

```bash
export ANTHROPIC_BASE_URL="http://localhost:7777"
```

O en `.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "test",
    "ANTHROPIC_API_KEY": "test",
    "ANTHROPIC_BASE_URL": "http://localhost:7777",
    "ANTHROPIC_MODEL": "sonnet",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "opus",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "sonnet",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "haiku",
    "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet",
    "ENABLE_EXPERIMENTAL_MCP_CLI": "true"
  },
  "model": "sonnet"
}
```

Modelos para Claude Code:

| Claude | Interno | Routing |
|--------|---------|---------|
| `haiku` | `vision-direct` | Gemini directo |
| `sonnet` | `deepseek-multimodal-flash` | Inteligente por contenido |
| `opus` | `deepseek-multimodal-pro` | Inteligente por contenido |

## Flujo de Trabajo "Cortex Sensorial v2"

### Matriz de Routing

| Contenido | Ejemplos | Routing | Razon |
|-----------|----------|---------|-------|
| Texto / Codigo | `.js`, `.py`, `.md` | DeepSeek directo | Maxima precision logica |
| Imagenes | `.jpg`, `.png`, Base64 | Gemini -> DeepSeek | OCR + descripcion visual |
| Audio | `.mp3`, `.wav`, `.m4a` | Gemini -> DeepSeek | Transcripcion + analisis de tono |
| Video | `.mp4`, `.mov`, `.webm` | Gemini -> DeepSeek | Analisis temporal de frames y audio |
| PDF (< 1MB) | `invoice.pdf` | Local -> DeepSeek | Privacidad y velocidad (pdf-parse) |
| PDF (> 1MB) | `manual.pdf` | Gemini -> DeepSeek | Mejor manejo de contexto y tablas |
| Docs | `.docx`, `.xlsx`, `.pptx` | Gemini -> DeepSeek | Extraccion estructural compleja |

### Proceso Detallado

1. **Recepcion**: Request en puerto 7777 (compatible OpenAI)
2. **Deteccion**: Analiza contenido por extension/MIME type
3. **Routing Inteligente**: Decide segun matriz anterior
4. **Procesamiento**:
   - **PDFs**: Routing basado en tamano. Local (<1MB) usa pdf2json + pdf-parse. Gemini (>1MB) para calidad/OCR. Fallback automatico.
   - **Otros formatos**: Descarga con validacion, hash contextual SHA-256, cache, analisis especializado con prompt por tipo
5. **Respuesta**: DeepSeek genera respuesta final (streaming o batch)

### Configuracion de PDFs

```bash
PDF_LOCAL_PROCESSING=true     # Procesamiento local para PDFs pequenos
PDF_LOCAL_MAX_SIZE_MB=1       # Tamano maximo para local (1MB)
```

**Local (<1MB)**: Sin costo de API Gemini, mas rapido, privacidad.
**Gemini (>1MB)**: Mejor calidad, OCR integrado, multilenguaje.

## Endpoints y Metricas

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | Chat multimodal (OpenAI) |
| `/v1/messages` | POST | Anthropic Messages API |
| `/v1/models` | GET | Lista de modelos |
| `/v1/cache/stats` | GET | Estadisticas de cache contextual |
| `/health` | GET | Estado del servicio + version |

### Metricas Tecnicas

- **Tamano maximo**: 50MB por archivo
- **Validacion previa**: HEAD requests detectan archivos >50MB antes de descargar
- **Timeout descarga**: 120 segundos para archivos grandes
- **Cache TTL**: 7 dias (configurable)
- **Formatos soportados**: JPEG, PNG, GIF, WebP, BMP, TIFF, SVG, MP3, WAV, M4A, MP4, MOV, WebM, PDF, DOCX, XLSX, PPTX

## Comandos NPM

```bash
npm run dev              # Desarrollo con hot reload
npm run build            # Compilar TypeScript
npm run start            # Iniciar produccion
npm run proxy:start      # Iniciar servicio en background
npm run proxy:stop       # Detener servicio
npm run proxy:logs       # Ver logs
npm run proxy:uninstall  # Remover servicio
npm run test:unit        # Tests unitarios (88 tests)
npm run test:coverage    # Cobertura de tests
npm run lint             # ESLint
npm run docker:up        # Iniciar con Docker
npm run docker:down      # Detener Docker
npm run docker:logs      # Logs de Docker
```

## Variables de Entorno (.env)

```bash
# DeepSeek V4
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_CONTEXT_WINDOW=872000       # 1M nativo - 128K holgura
DEEPSEEK_MAX_OUTPUT=384000
DEEPSEEK_THINKING_EFFORT=max         # high | max

# Gemini 2.5 Flash (Google AI)
GEMINI_API_KEY=tu_api_key
GEMINI_MODEL=gemini-2.5-flash

# Cache
CACHE_ENABLED=true
CACHE_DIR=./cache
CACHE_TTL_DAYS=7
CACHE_MAX_ENTRIES=1000

# Limites
MAX_FILE_SIZE_MB=50
MAX_IMAGES_PER_REQUEST=999

# PDFs
PDF_LOCAL_PROCESSING=true
PDF_LOCAL_MAX_SIZE_MB=1
```

## Estado Actual - Version 2.0.0

- **Arquitectura "Cortex Sensorial v2"** completa
- **DeepSeek V4 Flash + Pro** con Max Thinking (`reasoning_effort: "max"`)
- **Gemini 2.5 Flash** para percepcion multimodal (imagen, audio, video)
- **ESLint** configurado
- **88 Tests Unitarios** con Vitest
- **CI/CD Pipeline** con GitHub Actions
- **Soporte completo Claude Code** con tipos de contenido extendidos
- **Cache contextual SHA-256** eficiente
- **PDFs hibridos** local + Gemini con fallback automatico

## Soporte

Si encuentras util este proxy, puedes apoyar el desarrollo:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://buymeacoffee.com/exithial)

## Licencia

MIT
