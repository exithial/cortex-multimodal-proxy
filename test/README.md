# 🧪 Test Suite - DeepSeek Multimodal Proxy

This folder contains the consolidated test suite to verify multimodal functionality and the proxy's intelligent routing.

## 🚀 Quick Start

The only tool you need is the **Master Suite**:

```bash
# Start the proxy (if not running)
sudo systemctl start deepseek-proxy

# Run all tests
node test/test-master.js
```

## 📁 Structure

```
test/
├── README.md           # This file
├── test-master.js      # 👑 MASTER SUITE (Runs everything)
└── files/              # Real user test files
    ├── audio.mp3       # Test audio
    ├── image.png       # Test image
    ├── small-test.pdf  # Small PDF (<1MB)
    ├── large-test.pdf  # Medium/Large PDF
    └── video.mp4       # Test video
```

## 🔍 What does the Master Suite test?

`test-master.js` starts a temporary HTTP server (port 8899) to serve local files and simulate size responses, then runs sequential tests against the proxy (port 7777).

### Verified Scenarios:

1.  **Health Check**: Verifies service status and version.
2.  **Plain Text**: Direct routing to DeepSeek (Gemini bypass).
3.  **Image**: Routing to Gemini → DeepSeek.
4.  **Audio**: Routing to Gemini → DeepSeek (Input: `audio.mp3`).
5.  **Video**: Routing to Gemini → DeepSeek (Input: `video.mp4`).
6.  **PDF (Smart Routing)**:
    - **Small (<1MB)**: Local Processing → DeepSeek (uses `small-test.pdf`).
    - **Medium (<1MB)**: Local Processing (uses `large-test.pdf` if <1MB).
    - **Large (>1MB)**: Simulated routing to Gemini (uses simulated `/large.pdf` endpoint).
7.  **Base64**: Inline images (`data:image/...`) → Gemini.
8.  **Streaming**: Response validation in chunks (SSE) → Direct.

## 🛡️ Strategy Validation

The test verifies not only that the response is successful (200 OK), but also that the correct strategy was used via the `X-Multimodal-Strategy` header injected by the proxy.

| Content Type           | Expected Strategy | Reason                                                    |
| :--------------------- | :---------------- | :-------------------------------------------------------- |
| **Text**               | `direct`          | Faster and cheaper.                                       |
| **Image/Audio/Video**  | `gemini`          | Requires native multimodal capabilities.                  |
| **PDF < 1MB**          | `local`           | Privacy and speed (processed on the server itself).       |
| **PDF > 1MB**          | `gemini`          | Leverages Gemini's massive context window.                |

## ⚙️ Required Configuration (.env)

Make sure these variables are defined in your `.env` file for all tests to pass:

```ini
# Real API key for multimodal processing
GEMINI_API_KEY=your_google_api_key
GEMINI_MODEL=gemini-2.5-flash-lite

# PDF Routing Configuration
PDF_LOCAL_PROCESSING=true
PDF_LOCAL_MAX_SIZE_MB=1
```
