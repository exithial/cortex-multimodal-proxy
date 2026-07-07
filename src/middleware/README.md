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
   - `direct`: text/code -> brain direct (passthrough models like `mimo-v2.5` skip processing entirely)
   - `vision`: media -> Gemini fallback -> brain
   - `vision-mimo`: images -> MiMo V2.5 -> brain (text-only brains via `proxy/` prefix)
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
  - Process images with MiMo V2.5 senses (text-only brains)
  - Process audio/video/large PDFs with Gemini fallback (optional)
  - Process small PDFs locally (< 1MB)
  - Replace media with textual [DESCRIPTION]
  - Assemble final payload for brain (glm-5.2 or deepseek-v4-pro via OpenCode Go)
       |
Modified Request [Text + Descriptions]
       |
OpenCode Go -> Brain
```

## `multimodalProcessor.ts`

Orchestrates the full pipeline: detection -> senses (MiMo V2.5 or Gemini) -> brain submission.
Handles concurrency to process multiple files in parallel.
