# Cortex Multimodal Proxy (OpenCode Go Edition)

![License](https://img.shields.io/github/license/exithial/cortex-multimodal-proxy?style=flat-square&v=2)
![Version](https://img.shields.io/github/package-json/v/exithial/cortex-multimodal-proxy?style=flat-square)
![Node.js](https://img.shields.io/badge/node.js->=20.x-green?style=flat-square&logo=node.js)
![CI](https://github.com/exithial/cortex-multimodal-proxy/workflows/CI%2FCD%20Pipeline/badge.svg)

OpenAI/Anthropic-compatible HTTP proxy with **"Cortex Sensorial v3"** architecture: 4 brains via OpenCode Go subscription, MiMo V2.5 as multimodal senses for images, Gemini fallback for audio/video/PDF.

## "Cortex Sensorial v3" Architecture

- **4 Brains (text-only, max thinking)**: GLM-5.2, DeepSeek V4 Pro, Qwen3.7 Max, MiMo V2.5 Pro
- **MiMo V2.5 = Senses**: Cheap multimodal ($0.14/$0.28 per 1M tokens) for image description
- **Gemini 2.5 Flash = Fallback**: Audio, video, large PDFs (optional, only when needed)
- **Proxy = Cortex**: Intelligent routing per brain + content type, single Bearer token, retry with backoff

### Key Features

- **4 Brains via OpenCode Go**: One subscription ($10/month), single API key, curated models
- **Multimodal Layer**: MiMo V2.5 describes images; brain receives text descriptions
- **Per-Brain Selection**: `proxy/<brain-id>` in `/v1/chat/completions` — choose brain per request
- **Claude Code Compatible**: `haiku`/`sonnet`/`opus` aliases mapped via env to brain models
- **OpenCode Compatible**: All proxy brains in `/v1/models`
- **Full Multimodality**: Images (MiMo), audio/video/PDFs (Gemini fallback)
- **SSE Streaming**: Native support for real-time responses on both formats
- **Intelligent Routing**: 8 content types, per-brain context limits, truncate messages

### Modes

The proxy supports four `BRAIN_MODE` values:

- `auto` (default) — picks `deepseek` if `DEEPSEEK_API_KEY` is set, else `opencode` if `OPENCODE_GO_API_KEY` is set, else fatal at startup.
- `opencode` — only OpenCode Go brains (`proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro`) + MiMo V2.5 vision. Requires `OPENCODE_GO_API_KEY`.
- `deepseek` — only DeepSeek brains under their standard IDs (`proxy/deepseek-v4-pro`, `proxy/deepseek-v4-flash`) + MiniMax M3 vision (if `MINIMAX_API_KEY` set). Requires `DEEPSEEK_API_KEY`.
- `hybrid` — both providers loaded. OpenCode Go brains under `proxy/<id>`; user's DeepSeek under `proxy/local-deepseek-v4-{pro,flash}`. Vision follows `MINIMAX_API_KEY`.

To switch modes, set `BRAIN_MODE` in `.env` and restart. Existing clients (`opencode.json`) need no changes.

### Pricing

| Model ID | Input / Output per 1M | Notes |
|----------|----------------------|-------|
| `proxy/glm-5.2` | $1.40 / $4.40 per 1M (combined $1.54 / $4.40 with senses) | OpenCode Go brain |
| `proxy/deepseek-v4-pro` | $0.435 / $0.87 per 1M (combined $0.575 / $1.15 with senses) | Post-June 2026 price cut |
| `proxy/qwen3.7-max` | $2.50 / $7.50 per 1M (combined $2.64 / $7.78 with senses) | OpenCode Go brain (Anthropic-format) |
| `proxy/mimo-v2.5-pro` | $1.74 / $3.48 per 1M (combined $1.88 / $3.76 with senses) | OpenCode Go brain |
| `proxy/local-deepseek-v4-pro`  | DeepSeek V4 Pro via your account (BRAIN_MODE=hybrid) | User-billed |
| `proxy/local-deepseek-v4-flash` | DeepSeek V4 Flash via your account (BRAIN_MODE=hybrid) | User-billed |
| `mimo-v2.5` (passthrough) | $0.14 / $0.28 per 1M | BRAIN_MODE=opencode/hybrid |
| `MiniMax-M3` (passthrough) | Anthropic-format, billed by MiniMax | BRAIN_MODE=deepseek/hybrid |

## Requirements

- **Node.js** >= 20.x (LTS)
- **OpenCode Go API Key** (from https://opencode.ai/auth, $10/month subscription)
- **Google Gemini API Key** (optional, only for audio/video/PDF fallback)
- **Windows PowerShell 5.1+** or **bash** if using management scripts

## Platform Compatibility

- **Native Windows**: Via Node wrappers + PowerShell scripts
- **Linux**: Via Bash scripts + `systemd`
- **Docker / Docker Compose**: Windows, Linux, and macOS
- **node_modules shared across OSs**: Not recommended; reinstall with `npm install` when switching OS

## Quick Install

### Option 1: Automatic Script (Recommended)

```bash
git clone https://github.com/exithial/cortex-multimodal-proxy.git
cd cortex-multimodal-proxy
npm install
npm run setup
```

This configures everything automatically: compiles TypeScript, installs the `systemd` service (Linux) or starts the proxy in the background (Windows), and verifies availability.

### Option 2: Manual Install

```bash
npm install
npm run build
cp .env.example .env
# Edit .env with your API keys (OPENCODE_GO_API_KEY required)
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
    "cortex-multimodal": {
      "name": "Cortex Multimodal (Proxy v3)",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:7777/v1",
        "apiKey": "not-needed"
      },
      "models": {
        "proxy/glm-5.2": {
          "name": "GLM-5.2 (Cortex Proxy)",
          "cost": { "input": 1.54, "output": 4.40 },
          "limit": { "context": 819200, "output": 131072 },
          "modalities": { "input": ["text", "image", "audio", "video", "pdf"], "output": ["text"] }
        },
        "proxy/deepseek-v4-pro": {
          "name": "DeepSeek V4 Pro (Cortex Proxy)",
          "cost": { "input": 0.575, "output": 1.15 },
          "limit": { "context": 819200, "output": 384000 },
          "modalities": { "input": ["text", "image", "audio", "video", "pdf"], "output": ["text"] }
        },
        "proxy/local-deepseek-v4-pro": {
          "name": "DeepSeek V4 Pro (your account, BRAIN_MODE=hybrid)",
          "cost": { "input": 0.435, "output": 0.87 },
          "limit": { "context": 819200, "output": 384000 },
          "modalities": { "input": ["text", "image", "audio", "video", "pdf"], "output": ["text"] }
        },
        "proxy/local-deepseek-v4-flash": {
          "name": "DeepSeek V4 Flash (your account, BRAIN_MODE=hybrid)",
          "cost": { "input": 0.14, "output": 0.28 },
          "limit": { "context": 819200, "output": 384000 },
          "modalities": { "input": ["text", "image", "audio", "video", "pdf"], "output": ["text"] }
        },
        "proxy/qwen3.7-max": {
          "name": "Qwen3.7 Max (Cortex Proxy)",
          "cost": { "input": 2.64, "output": 7.78 },
          "limit": { "context": 819200, "output": 65536 },
          "modalities": { "input": ["text", "image", "audio", "video", "pdf"], "output": ["text"] }
        },
        "proxy/mimo-v2.5-pro": {
          "name": "MiMo V2.5 Pro (Cortex Proxy)",
          "cost": { "input": 1.88, "output": 3.76 },
          "limit": { "context": 819200, "output": 65536 },
          "modalities": { "input": ["text", "image", "audio", "video", "pdf"], "output": ["text"] }
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

Default Claude Code mappings (configurable via env vars):
- `haiku` → `mimo-v2.5` (passthrough, multimodal native, no senses layer)
- `sonnet` → `proxy/deepseek-v4-pro` (fastest brain, max thinking)
- `opus` → `proxy/glm-5.2` (strongest text brain)

## "Cortex Sensorial v3" Workflow

### Routing Matrix

| Content | Brain model | Senses layer | Example |
|---------|------------|--------------|---------|
| Text / Code | Direct to brain | None | `.js`, `.py`, `.md` |
| Image | Brain processes MiMo description | MiMo V2.5 | `.png`, `.jpg`, Base64 |
| Audio | Brain processes Gemini description | Gemini 2.5 Flash | `.mp3`, `.wav`, `.m4a` |
| Video | Brain processes Gemini description | Gemini 2.5 Flash | `.mp4`, `.mov`, `.webm` |
| PDF (< 1MB) | Local parser → Brain | pdf-parse | small PDF |
| PDF (> 1MB) | Brain processes Gemini description | Gemini 2.5 Flash | manual PDF |

### Brain selection by client

- **OpenCode**: `model: "proxy/deepseek-v4-pro"` (or any `proxy/<brain-id>`) in `/v1/chat/completions`
- **Claude Code**: `model: "sonnet"` (mapped to `proxy/deepseek-v4-pro` by default)

## Endpoints and Metrics

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | Multimodal chat (OpenAI) |
| `/v1/messages` | POST | Anthropic Messages API (Claude Code) |
| `/v1/models` | GET | Model list (4 proxy brains + 1 passthrough) |
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
npm run test:unit        # Unit tests
npm run test:coverage    # Test coverage
npm run lint             # ESLint
npm run docker:up        # Start with Docker
npm run docker:down      # Stop Docker
npm run docker:logs      # Docker logs
```

## Environment Variables (.env)

```bash
# OpenCode Go (required)
OPENCODE_GO_API_KEY=sk-your-opencode-go-key
OPENCODE_GO_BASE_URL=https://opencode.ai/zen/go/v1
OPENCODE_GO_TIMEOUT_MS=120000

# Senses - MiMo V2.5 for images
SENSES_MODEL=mimo-v2.5
SENSES_TIMEOUT_MS=120000

# Claude Code mappings
CLAUDE_HAIKU_MODEL=mimo-v2.5
CLAUDE_SONNET_MODEL=proxy/deepseek-v4-pro
CLAUDE_OPUS_MODEL=proxy/glm-5.2

# Gemini fallback (optional, audio/video/PDF only)
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-2.5-flash

# Cache
CACHE_ENABLED=true
CACHE_DIR=./cache
CACHE_TTL_DAYS=7

# Limits
MAX_FILE_SIZE_MB=50
MAX_IMAGES_PER_REQUEST=999

# PDFs
PDF_LOCAL_PROCESSING=true
PDF_LOCAL_MAX_SIZE_MB=1
```

## Current Status - Version 3.2.0

- **"Cortex Sensorial v3" architecture** complete
- **4 brains** via OpenCode Go: GLM-5.2, DeepSeek V4 Pro, Qwen3.7 Max, MiMo V2.5 Pro (all max thinking)
- **1 passthrough model** for natively multimodal: mimo-v2.5
- **MiMo V2.5** as multimodal senses for images (replaces Gemini for vision)
- **Gemini 2.5 Flash** fallback for audio/video/PDFs (optional)
- **Retry with exponential backoff** (3 attempts, 2s/4s delays) for upstream503/502/429
- **Single Bearer token** via OpenCode Go subscription ($10/month)

## License

MIT License - see LICENSE for details.