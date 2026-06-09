# Middleware

Componentes de procesamiento intermedio para el pipeline de requests.

## `multimodalDetector.ts`

**Core del Proxy**: Detecta y clasifica contenido multimodal en los mensajes del request.

### Funcionalidad
1. **Deteccion**: Escanea los mensajes del request (formato OpenAI/Anthropic) buscando:
   - `image_url` en contenido multipart
   - Strings Base64 (`data:image/...`) embebidos en contenido texto
   - URLs de archivos (audio, video, PDF)
2. **Clasificacion**: Categoriza cada contenido en tipos internos: image, audio, video, document, code, text_file, data_file, pdf
3. **Extraccion de Contexto**: Analiza el texto del usuario para enviarlo junto al contenido al servicio de vision
4. **Enrutamiento**: Decide la estrategia de procesamiento:
   - `direct`: texto/codigo -> DeepSeek directo
   - `vision`: media -> Gemini -> DeepSeek
   - `vision-direct`: Gemini directo sin DeepSeek
   - `local`: PDF pequeno procesado localmente
   - `mixed`: combinacion de estrategias

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
  - Reemplazar media por [DESCRIPCION] textual
  - Ensamblar payload final para DeepSeek
       |
Request Modificado [Texto + Descripciones]
       |
DeepSeek API
```

## `multimodalProcessor.ts`

Orquesta el pipeline completo: deteccion -> procesamiento con Gemini -> envio a DeepSeek.
Maneja concurrencia para procesar multiples archivos en paralelo.
