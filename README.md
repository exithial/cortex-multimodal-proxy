# DeepSeek Multimodal Proxy (Gemini Edition)

![License](https://img.shields.io/github/license/exithial/deepseek-multimodal-proxy?style=flat-square)
![Version](https://img.shields.io/github/package-json/v/exithial/deepseek-multimodal-proxy?style=flat-square)
![Node.js](https://img.shields.io/badge/node.js->=20.x-green?style=flat-square&logo=node.js)
![CI](https://github.com/exithial/deepseek-multimodal-proxy/workflows/CI%2FCD%20Pipeline/badge.svg)

OpenAI-compatible HTTP proxy with **"Sensory Cortex v2"** architecture: DeepSeek V4 as the brain and Gemini 2.5 Flash as the multimodal perception system.

## "Sensory Cortex v2" Architecture

- **DeepSeek V4 = Brain**: Logic, code, pure reasoning (Flash + Pro with Max thinking)
- **Gemini 2.5 Flash = Senses**: Complete multimodal perception (image, audio, video, documents, PDFs)
- **Proxy = Cortex**: Intelligent routing by cognitive specialty

### Key Features

- **Automatic Intelligent Routing**: Detects 8 content types and decides optimal routing
- **Full Multimodality**: Images, audio, video, PDFs, documents, code, text
- **Direct Mode**: Use `vision-direct` to bypass DeepSeek with direct Gemini responses
- **Hybrid PDF Processing**: Local (<1MB) for speed or Gemini (>1MB) for quality/OCR
- **Automatic Download with Validation**: URLs with real Content-Type validation and 50MB limit
- **SHA-256 Contextual Cache**: Unique hash per content + question (avoids reprocessing)
- **SSE Streaming**: Native support for real-time responses
- **Optimized for OpenCode**: Transparent mapping of `text`, `image`, `audio`, `video`, `pdf` modalities
- **DeepSeek V4 Max Thinking**: Both Flash and Pro with `reasoning_effort: "max"` for maximum quality

## Requirements

- **Node.js** >= 20.x (LTS)
- **DeepSeek API Key** (for reasoning/text)
- **Google Gemini API Key** (for multimodal perception)
- **Windows PowerShell 5.1+** or **bash** if using management scripts

## Platform Compatibility

- **Native Windows**: Via Node wrappers + PowerShell scripts
- **Linux**: Via Bash scripts + `systemd`
- **Docker / Docker Compose**: Windows, Linux, and macOS
- **node_modules shared across OSs**: Not recommended; reinstall with `npm install` when switching OS

## Quick Install

### Option 1: Automatic Script (Recommended)

```bash
git clone https://github.com/exithial/deepseek-multimodal-proxy.git
cd deepseek-multimodal-proxy
npm install
npm run setup
```

This configures everything automatically: compiles TypeScript, installs the `systemd` service (Linux) or starts the proxy in the background (Windows), and verifies availability.

### Option 2: Manual Install

```bash
npm install
npm run build
cp .env.example .env
# Edit .env with your API keys
npm run proxy:start
```

### Option 3: Docker Compose

```bash
npm run docker:build
npm run docker:up
```

Notes: Uses `.env` as container configuration, exposes port `7777`, persists `cache/` in a Docker volume, starts with `restart: always`.

## OpenCode Integration

Add to `~/.config/opencode/opencode.json`:

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

## Claude Code Integration

```bash
export ANTHROPIC_BASE_URL="http://localhost:7777"
```

Or in `.claude/settings.json`:

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

Models for Claude Code:

| Claude | Internal | Routing |
|--------|---------|---------|
| `haiku` | `vision-direct` | Direct Gemini |
| `sonnet` | `deepseek-multimodal-flash` | Intelligent by content |
| `opus` | `deepseek-multimodal-pro` | Intelligent by content |

## "Sensory Cortex v2" Workflow

### Routing Matrix

| Content | Examples | Routing | Reason |
|-----------|----------|---------|-------|
| Text / Code | `.js`, `.py`, `.md` | DeepSeek direct | Maximum logical precision |
| Images | `.jpg`, `.png`, Base64 | Gemini -> DeepSeek | OCR + visual description |
| Audio | `.mp3`, `.wav`, `.m4a` | Gemini -> DeepSeek | Transcription + tone analysis |
| Video | `.mp4`, `.mov`, `.webm` | Gemini -> DeepSeek | Temporal frame and audio analysis |
| PDF (< 1MB) | `invoice.pdf` | Local -> DeepSeek | Privacy and speed (pdf-parse) |
| PDF (> 1MB) | `manual.pdf` | Gemini -> DeepSeek | Better context and table handling |
| Docs | `.docx`, `.xlsx`, `.pptx` | Gemini -> DeepSeek | Complex structural extraction |

### Detailed Process

1. **Reception**: Request on port 7777 (OpenAI-compatible)
2. **Detection**: Analyzes content by extension/MIME type
3. **Intelligent Routing**: Decides based on the above matrix
4. **Processing**:
   - **PDFs**: Size-based routing. Local (<1MB) uses pdf2json + pdf-parse. Gemini (>1MB) for quality/OCR. Automatic fallback.
   - **Other formats**: Download with validation, SHA-256 contextual hash, cache, specialized analysis with type-specific prompts
5. **Response**: DeepSeek generates the final response (streaming or batch)

### PDF Configuration

```bash
PDF_LOCAL_PROCESSING=true     # Local processing for small PDFs
PDF_LOCAL_MAX_SIZE_MB=1       # Max size for local (1MB)
```

**Local (<1MB)**: No Gemini API cost, faster, privacy.
**Gemini (>1MB)**: Better quality, built-in OCR, multilingual.

## Endpoints and Metrics

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | Multimodal chat (OpenAI) |
| `/v1/messages` | POST | Anthropic Messages API |
| `/v1/models` | GET | Model list |
| `/v1/cache/stats` | GET | Contextual cache statistics |
| `/health` | GET | Service status + version |

### Technical Metrics

- **Max size**: 50MB per file
- **Pre-validation**: HEAD requests detect files >50MB before downloading
- **Download timeout**: 120 seconds for large files
- **Cache TTL**: 7 days (configurable)
- **Supported formats**: JPEG, PNG, GIF, WebP, BMP, TIFF, SVG, MP3, WAV, M4A, MP4, MOV, WebM, PDF, DOCX, XLSX, PPTX

## NPM Commands

```bash
npm run dev              # Development with hot reload
npm run build            # Compile TypeScript
npm run start            # Start production
npm run proxy:start      # Start service in background
npm run proxy:stop       # Stop service
npm run proxy:logs       # View logs
npm run proxy:uninstall  # Remove service
npm run test:unit        # Unit tests (88 tests)
npm run test:coverage    # Test coverage
npm run lint             # ESLint
npm run docker:up        # Start with Docker
npm run docker:down      # Stop Docker
npm run docker:logs      # Docker logs
```

## Environment Variables (.env)

```bash
# DeepSeek V4
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_CONTEXT_WINDOW=872000       # 1M native - 128K headroom
DEEPSEEK_MAX_OUTPUT=384000
DEEPSEEK_THINKING_EFFORT=max         # high | max

# Gemini 2.5 Flash (Google AI)
GEMINI_API_KEY=your_api_key
GEMINI_MODEL=gemini-2.5-flash

# Cache
CACHE_ENABLED=true
CACHE_DIR=./cache
CACHE_TTL_DAYS=7
CACHE_MAX_ENTRIES=1000

# Limits
MAX_FILE_SIZE_MB=50
MAX_IMAGES_PER_REQUEST=999

# PDFs
PDF_LOCAL_PROCESSING=true
PDF_LOCAL_MAX_SIZE_MB=1
```

## Current Status - Version 2.0.0

- **"Sensory Cortex v2" architecture** complete
- **DeepSeek V4 Flash + Pro** with Max Thinking (`reasoning_effort: "max"`)
- **Gemini 2.5 Flash** for multimodal perception (image, audio, video)
- **ESLint** configured
- **88 Unit Tests** with Vitest
- **CI/CD Pipeline** with GitHub Actions
- **Full Claude Code support** with extended content types
- **Efficient SHA-256 contextual cache**
- **Hybrid PDFs** local + Gemini with automatic fallback

## Support

If you find this proxy useful, you can support the development:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://buymeacoffee.com/exithial)

## License

MIT
