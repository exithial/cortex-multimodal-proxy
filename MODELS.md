# Model Configuration

## OpenCode Models (OpenAI API)

### DeepSeek V4 Flash - Chat (Max Thinking)

- **Context max**: 872,000 tokens (1M nativo, 128K holgura para headers)
- **Output max**: 384,000 tokens
- **API params**: `thinking: { type: "enabled" }` + `reasoning_effort: "max"`
- **Model**: `deepseek-v4-flash`

### DeepSeek V4 Pro - Reasoner (Max Thinking)

- **Context max**: 872,000 tokens (1M nativo, 128K holgura)
- **Output max**: 384,000 tokens
- **API params**: `thinking: { type: "enabled" }` + `reasoning_effort: "max"`
- **Model**: `deepseek-v4-pro`

### Vision with Gemini 2.5 Flash

All models use **Gemini 2.5 Flash** for multimodal perception:

- **Image analysis**: OCR and visual description
- **Audio analysis**: Transcription and contextual description
- **Video analysis**: Frame-by-frame description with audio sync
- **PDF support**: Hybrid system (local for <1MB, Gemini for quality/OCR)
- **Contextual cache**: SHA-256(content + question) hash
- **File limit**: 50MB

### Intelligent Routing

```
"deepseek-multimodal-flash" -> DeepSeek V4 Flash (max thinking) + Gemini Vision
"deepseek-multimodal-pro"   -> DeepSeek V4 Pro (max thinking) + Gemini Vision
```

### Available Proxy Models

| Proxy Model                | Backend Model       | Input  | Output | Modalities                       |
| :------------------------- | :------------------ | :----- | :----- | :------------------------------- |
| `deepseek-multimodal-flash`| `deepseek-v4-flash` | 872K   | 384K   | Text, Image, Audio, Video, PDF   |
| `deepseek-multimodal-pro`  | `deepseek-v4-pro`   | 872K   | 384K   | Text, Image, Audio, Video, PDF   |
| `vision-direct`            | `gemini-2.5-flash`  | 1M     | 8K     | Full Multimodal (Direct)         |

### Pricing (per 1M tokens, worst case combined)

| Model                      | Input  | Output |
| :------------------------- | :----- | :----- |
| `deepseek-multimodal-flash`| $0.30  | $0.88  |
| `deepseek-multimodal-pro`  | $0.59  | $1.47  |
| `vision-direct`            | $0.15  | $0.60  |

## Claude Code Models (Anthropic)

| Claude | Internal Model             | Routing                                                   |
| :----- | :------------------------- | :--------------------------------------------------------- |
| `haiku`| `vision-direct`            | Gemini 2.5 Flash directo                                   |
| `sonnet`| `deepseek-multimodal-flash`| Inteligente: Texto -> DeepSeek, Multimodal -> Gemini       |
| `opus` | `deepseek-multimodal-pro`  | Inteligente: Texto -> DeepSeek, Multimodal -> Gemini       |
