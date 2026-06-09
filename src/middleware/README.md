# Middleware

Intermediate processing components for the request pipeline.

## `multimodalDetector.ts`

**Proxy Core**: Detects and classifies multimodal content in request messages.

### Functionality
1. **Detection**: Scans request messages (OpenAI/Anthropic format) looking for:
   - `image_url` in multipart content
   - Base64 strings (`data:image/...`) embedded in text content
   - File URLs (audio, video, PDF)
2. **Classification**: Categorizes each content into internal types: image, audio, video, document, code, text_file, data_file, pdf
3. **Context Extraction**: Analyzes user text to send it alongside the content to the vision service
4. **Routing**: Decides the processing strategy:
   - `direct`: text/code -> DeepSeek direct
   - `vision`: media -> Gemini -> DeepSeek
   - `vision-direct`: Gemini direct without DeepSeek
   - `local`: small PDF processed locally
   - `mixed`: combination of strategies

### Data Flow
```
Original Request [Text + Media]
       |
[MIDDLEWARE DETECTOR]
  - Classify content (image, audio, video, pdf, etc.)
  - Determine routing strategy
  - Extract user context
       |
[MIDDLEWARE PROCESSOR]
  - Process media with Gemini (with SHA-256 cache)
  - Replace media with textual [DESCRIPTION]
  - Assemble final payload for DeepSeek
       |
Modified Request [Text + Descriptions]
       |
DeepSeek API
```

## `multimodalProcessor.ts`

Orchestrates the full pipeline: detection -> Gemini processing -> DeepSeek submission.
Handles concurrency to process multiple files in parallel.
