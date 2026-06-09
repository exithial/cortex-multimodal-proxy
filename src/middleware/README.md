# Middleware

Componentes de procesamiento intermedio para el pipeline de requests.

## `multimodalDetector.ts`

**Core del Proxy**: Detecta y clasifica contenido multimodal en los mensajes del request.

### Funcionalidad
1. **Detección**: Escanea los mensajes del request (formato OpenAI/Anthropic) buscando:
   - `image_url` en contenido multipart
   - Strings Base64 (`data:image/...`) embebidos en contenido texto
   - URLs de archivos (audio, video, PDF)
2. **Clasificación**: Categoriza cada contenido en tipos internos: image, audio, video, document, code, text_file, data_file, pdf
3. **Extracción de Contexto**: Analiza el texto del usuario para enviarlo junto al contenido al servicio de visión
4. **Enrutamiento**: Decide la estrategia de procesamiento:
   - `direct`: texto/código -> DeepSeek directo
   - `vision`: media -> Gemini -> DeepSeek
   - `vision-direct`: Gemini directo sin DeepSeek
   - `local`: PDF pequeño procesado localmente
   - `mixed`: combinación de estrategias

### Flujo de Datos
```
Request Original [Texto + Media]
       |
[MIDDLEWARE DETECTOR]
  - Clasificar contenido (image, audio, video, pdf, etc.)
  - Determinar estrategia de ruteo
  - Extraer contexto del usuario
       |
[MIDDLEWARE PROCESSOR]
  - Procesar media con Gemini (con cache SHA-256)
  - Reemplazar media por [DESCRIPCIÓN] textual
  - Ensamblar payload final para DeepSeek
       |
Request Modificado [Texto + Descripciones]
       |
DeepSeek API
```

## `multimodalProcessor.ts`

Orquesta el pipeline completo: detección -> procesamiento con Gemini -> envío a DeepSeek.
Maneja concurrencia para procesar múltiples archivos en paralelo.
