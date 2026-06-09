import type { ChatMessage } from "../types/openai";
import { logger } from "../utils/logger";

export interface DetectedContent {
  source: string;

  // Tipo normalizado para OpenCode (5 formatos oficiales)
  type: "text" | "audio" | "image" | "video" | "pdf";

  // Tipo interno detallado para routing inteligente
  internalType:
    | "image"
    | "audio"
    | "video"
    | "document"
    | "code"
    | "text_file"
    | "data_file"
    | "pdf";

  messageIndex: number;
  contentIndex?: number;
  format?: string;
  extension?: string;
  mimeType?: string;
}

export interface ContentAnalysis {
  needsLocalProcessing: boolean;
  detectedContent: DetectedContent[];
  hasOnlyText: boolean;
  deepseekDirectContent: DetectedContent[];
  visionRequiredContent: DetectedContent[];
  localProcessingContent: DetectedContent[];
}

/**
 * Detecta el tipo de archivo por extensión o MIME type
 */
function detectFileType(
  source: string,
  format?: string,
): {
  type: DetectedContent["type"];
  internalType: DetectedContent["internalType"];
  extension?: string;
  mimeType?: string;
} {
  // Extraer extensión si es una URL o nombre de archivo
  let extension = "";

  // 0. Soporte para Data URIs (Base64)
  if (source.startsWith("data:")) {
    try {
      // Formato: data:image/png;base64,...
      const mimeType = source.split(";")[0].split(":")[1];
      if (mimeType) {
        // Mapeo simple de mime a extensión
        extension = mimeType.split("/")[1]?.toLowerCase() || "";
        // Corregir casos especiales
        if (extension === "jpeg") extension = "jpg";
        if (extension === "svg+xml") extension = "svg";
        if (extension === "plain") extension = "txt";
        if (extension === "mpeg") extension = "mp3";
      }
    } catch (_e) {
      // Ignorar errores de parseo
    }
  }

  // 1. URL o Archivo normal
  else if (source.includes(".")) {
    const match = source.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
    if (match) {
      extension = match[1].toLowerCase();
    }
  }

  // Mapear extensiones a tipos INTERNOS (granulares para routing)
  const extensionMap: Record<string, DetectedContent["internalType"]> = {
    // Código fuente (DeepSeek directo)
    py: "code",
    js: "code",
    ts: "code",
    jsx: "code",
    tsx: "code",
    rs: "code",
    go: "code",
    java: "code",
    cpp: "code",
    c: "code",
    h: "code",
    hpp: "code",
    cs: "code",
    php: "code",
    rb: "code",
    swift: "code",
    kt: "code",
    scala: "code",
    pl: "code",
    lua: "code",
    sql: "code",
    html: "code",
    css: "code",
    scss: "code",
    less: "code",
    json: "code",
    xml: "code",
    yaml: "code",
    yml: "code",
    toml: "code",
    ini: "code",
    env: "code",
    sh: "code",
    bash: "code",
    zsh: "code",
    md: "code",
    txt: "code",

    // PDFs (procesamiento local)
    pdf: "pdf",

    // Otros documentos (Gemini requerido)
    doc: "document",
    docx: "document",
    xls: "document",
    xlsx: "document",
    ppt: "document",
    pptx: "document",
    csv: "data_file",

    // Imágenes (depende del formato)
    jpg: "image",
    jpeg: "image",
    png: "image",
    gif: "image",
    webp: "image",
    svg: "image",
    bmp: "image",
    tiff: "image",

    // Audio (Gemini requerido)
    mp3: "audio",
    wav: "audio",
    m4a: "audio",
    aac: "audio",
    flac: "audio",
    ogg: "audio",

    // Video (Gemini requerido)
    mp4: "video",
    mov: "video",
    avi: "video",
    mkv: "video",
    webm: "video",
    flv: "video",
  };

  // Si no hay extensión pero es una URL de imagen conocida (como picsum.photos)
  // o si el formato indica que es una imagen, tratarla como imagen
  let internalType: DetectedContent["internalType"] =
    extensionMap[extension] || "document";

  // Heurística para URLs de imágenes sin extensión
  if (internalType === "document" && source.includes("http")) {
    const imageDomains = [
      "picsum.photos",
      "unsplash.com",
      "pexels.com",
      "imgur.com",
      "flickr.com",
    ];
    const imageKeywords = [
      "image",
      "photo",
      "picture",
      "img",
      "avatar",
      "thumbnail",
    ];

    if (
      imageDomains.some((domain) => source.includes(domain)) ||
      imageKeywords.some((keyword) => source.toLowerCase().includes(keyword))
    ) {
      internalType = "image";
    }
  }

  // También verificar si el formato/MIME type indica el tipo
  if (format) {
    if (format.startsWith("image/")) {
      internalType = "image";
    } else if (format.startsWith("audio/")) {
      internalType = "audio";
    } else if (format.startsWith("video/")) {
      internalType = "video";
    } else if (format.includes("pdf")) {
      internalType = "pdf";
    } else if (format.includes("word") || format.includes("document")) {
      internalType = "document";
    } else if (format.includes("spreadsheet") || format.includes("excel")) {
      internalType = "document";
    } else if (
      format.includes("presentation") ||
      format.includes("powerpoint")
    ) {
      internalType = "document";
    } else if (format.startsWith("text/")) {
      internalType = "text_file";
    } else if (
      format.includes("json") ||
      format.includes("xml") ||
      format.includes("yaml")
    ) {
      internalType = "code";
    }
  }

  // Mapear a MIME types
  const mimeTypeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    ogg: "audio/ogg",
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    webm: "video/webm",
    flv: "video/x-flv",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    xml: "application/xml",
    yaml: "application/x-yaml",
    yml: "application/x-yaml",
  };

  // Mapear tipo interno a tipo OpenCode normalizado
  const internalToOpenCode: Record<
    DetectedContent["internalType"],
    DetectedContent["type"]
  > = {
    image: "image",
    audio: "audio",
    video: "video",
    pdf: "pdf",
    document: "pdf", // Documentos complejos → pdf
    code: "text", // Código → text
    text_file: "text", // Archivos de texto → text
    data_file: "text", // JSON/YAML/CSV → text
  };

  const normalizedType = internalToOpenCode[internalType];

  return {
    type: normalizedType,
    internalType,
    extension,
    mimeType: mimeTypeMap[extension] || format || "application/octet-stream",
  };
}

/**
 * Detecta contenido multimodal en los mensajes
 * SOLO detecta en el ÚLTIMO mensaje del usuario
 * Ahora async para soportar detección de tamaño en PDFs
 */
export async function detectMultimodalContent(
  messages: ChatMessage[],
): Promise<ContentAnalysis> {
  const detectedContent: DetectedContent[] = [];
  let hasOnlyText = true;

  // Buscar el último mensaje del usuario (el mensaje actual)
  let lastUserMessageIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserMessageIndex = i;
      break;
    }
  }

  // Si no hay mensaje de usuario, no hay contenido
  if (lastUserMessageIndex === -1) {
    return {
      needsLocalProcessing: false,
      detectedContent: [],
      hasOnlyText: true,
      deepseekDirectContent: [],
      visionRequiredContent: [],
      localProcessingContent: [],
    };
  }

  const message = messages[lastUserMessageIndex];

  if (!message.content) {
    return {
      needsLocalProcessing: false,
      detectedContent: [],
      hasOnlyText: true,
      deepseekDirectContent: [],
      visionRequiredContent: [],
      localProcessingContent: [],
    };
  }

  // Caso 1: Contenido multipart
  if (Array.isArray(message.content)) {
    for (let j = 0; j < message.content.length; j++) {
      const part = message.content[j];

      switch (part.type) {
        case "image_url":
          if (part.image_url?.url) {
            const fileInfo = detectFileType(part.image_url.url);
            detectedContent.push({
              source: part.image_url.url,
              type: fileInfo.type,
              internalType: fileInfo.internalType,
              messageIndex: lastUserMessageIndex,
              contentIndex: j,
              format: part.image_url.detail,
              extension: fileInfo.extension,
              mimeType: fileInfo.mimeType,
            });
            hasOnlyText = false;
          }
          break;

        case "audio_url":
          if (part.audio_url?.url) {
            const fileInfo = detectFileType(
              part.audio_url.url,
              part.audio_url.format,
            );
            detectedContent.push({
              source: part.audio_url.url,
              type: fileInfo.type,
              internalType: fileInfo.internalType,
              messageIndex: lastUserMessageIndex,
              contentIndex: j,
              format: part.audio_url.format,
              extension: fileInfo.extension,
              mimeType: fileInfo.mimeType,
            });
            hasOnlyText = false;
          }
          break;

        case "video_url":
          if (part.video_url?.url) {
            const fileInfo = detectFileType(
              part.video_url.url,
              part.video_url.format,
            );
            detectedContent.push({
              source: part.video_url.url,
              type: fileInfo.type,
              internalType: fileInfo.internalType,
              messageIndex: lastUserMessageIndex,
              contentIndex: j,
              format: part.video_url.format,
              extension: fileInfo.extension,
              mimeType: fileInfo.mimeType,
            });
            hasOnlyText = false;
          }
          break;

        case "document_url":
          if (part.document_url?.url) {
            const fileInfo = detectFileType(
              part.document_url.url,
              part.document_url.format,
            );
            detectedContent.push({
              source: part.document_url.url,
              type: fileInfo.type,
              internalType: fileInfo.internalType,
              messageIndex: lastUserMessageIndex,
              contentIndex: j,
              format: part.document_url.format,
              extension: fileInfo.extension,
              mimeType: fileInfo.mimeType,
            });
            hasOnlyText = false;
          }
          break;

        case "image":
          if (part.image) {
            const source =
              typeof part.image === "string" ? part.image : "[binary-image]";
            const fileInfo = detectFileType(source, part.mediaType);
            detectedContent.push({
              source,
              type: fileInfo.type,
              internalType: fileInfo.internalType,
              messageIndex: lastUserMessageIndex,
              contentIndex: j,
              format: part.mediaType,
              extension: fileInfo.extension,
              mimeType: fileInfo.mimeType,
            });
            hasOnlyText = false;
          }
          break;

        case "file":
          if (part.file?.data) {
            const source =
              typeof part.file.data === "string"
                ? part.file.data
                : "[binary-file]";
            const fileInfo = detectFileType(source, part.file.mediaType);
            detectedContent.push({
              source,
              type: fileInfo.type,
              internalType: fileInfo.internalType,
              messageIndex: lastUserMessageIndex,
              contentIndex: j,
              format: part.file.mediaType,
              extension: fileInfo.extension,
              mimeType: fileInfo.mimeType,
            });
            hasOnlyText = false;
          }
          break;

        case "input_audio":
          if (part.input_audio?.data) {
            const source = part.input_audio.data;
            const format = part.input_audio.format || "mp3";
            const fileInfo = detectFileType(source, `audio/${format}`);

            detectedContent.push({
              source,
              type: "audio",
              internalType: "audio",
              messageIndex: lastUserMessageIndex,
              contentIndex: j,
              format: format,
              extension: fileInfo.extension || format,
              mimeType: fileInfo.mimeType || `audio/${format}`,
            });
            hasOnlyText = false;
          }
          break;

        case "text":
          // Texto puro, no necesita procesamiento especial
          // Pero podríamos detectar si es código embebido
          if (part.text && part.text.includes("```")) {
            // Podría contener código, pero lo manejamos como texto
          }
          break;
      }
    }
  }

  // Caso 2: Base64 embebido en texto (imágenes y archivos)
  if (typeof message.content === "string") {
    // Detectar imágenes Base64
    const base64ImageRegex = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
    const imageMatches = message.content.match(base64ImageRegex);

    if (imageMatches) {
      for (const match of imageMatches) {
        const mimeType = match.match(/data:([^;]+)/)?.[1] || "image/jpeg";
        detectedContent.push({
          source: match,
          type: "image",
          internalType: "image",
          messageIndex: lastUserMessageIndex,
          mimeType,
        });
        hasOnlyText = false;
      }
    }

    // Detectar archivos Base64 (PDFs, audio, video, documentos)
    const base64FileRegex =
      /data:(application|audio|video)\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
    const fileMatches = message.content.match(base64FileRegex);

    if (fileMatches) {
      for (const match of fileMatches) {
        const mimeType =
          match.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
        const fileInfo = detectFileType(match, mimeType);
        detectedContent.push({
          source: match,
          type: fileInfo.type,
          internalType: fileInfo.internalType,
          messageIndex: lastUserMessageIndex,
          mimeType: fileInfo.mimeType,
          extension: fileInfo.extension,
        });
        hasOnlyText = false;
      }
    }
  }

  const deepseekDirectContent = getDeepseekSupportedContent(detectedContent);
  const visionRequiredContent = await getVisionRequiredContent(detectedContent);
  const localProcessingContent =
    await getLocalProcessingContent(detectedContent);

  const needsLocalProcessing = localProcessingContent.length > 0;

  return {
    needsLocalProcessing,
    detectedContent,
    hasOnlyText,
    deepseekDirectContent,
    visionRequiredContent,
    localProcessingContent,
  };
}

/**
 * Extrae el contexto textual del mensaje
 */
export function extractUserContext(messages: ChatMessage[]): string {
  // Buscar el último mensaje del usuario
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "user" && message.content) {
      if (typeof message.content === "string") {
        return message.content;
      } else if (Array.isArray(message.content)) {
        // Extraer solo las partes de texto
        const textParts = message.content
          .filter((part) => part.type === "text" && part.text)
          .map((part) => part.text)
          .join(" ");
        return textParts;
      }
    }
  }
  return "";
}

/**
 * Determina qué contenido puede manejar DeepSeek directamente.
 * DeepSeek se encarga del contenido textual, código y datos estructurados.
 */
export function getDeepseekSupportedContent(
  content: DetectedContent[],
): DetectedContent[] {
  return content.filter((item) => {
    // 1. Código fuente (dominio nativo de DeepSeek)
    if (item.internalType === "code") {
      return true;
    }

    // 2. Texto plano y documentación
    if (item.internalType === "text_file") {
      return true; // DeepSeek maneja texto puro
    }

    // 3. Data files simples (JSON, YAML, etc.)
    if (
      item.internalType === "data_file" &&
      ["json", "yaml", "yml", "xml", "csv"].includes(item.extension || "")
    ) {
      return true; // DeepSeek puede leer estos formatos
    }

    // PDFs ahora van a Gemini (soporta vision)
    // El texto procesado por Gemini va a DeepSeek
    if (item.internalType === "pdf") {
      return false; // PDFs van a Gemini, no directo a DeepSeek
    }

    // Todas las imagenes pasan por Gemini para consistencia y mejor calidad

    return false;
  });
}

/**
 * Determina que contenido necesita procesamiento por Gemini (vision).
 * Gemini procesa contenido visual, auditivo y documentos complejos.
 */
export async function getVisionRequiredContent(
  content: DetectedContent[],
): Promise<DetectedContent[]> {
  // Primero obtener qué contenido va local
  const localContent = await getLocalProcessingContent(content);
  const localSources = new Set(localContent.map((item) => item.source));

  return content.filter((item) => {
    // Si va local, no va a Gemini
    if (localSources.has(item.source)) {
      return false;
    }

    // 1. TODAS las imagenes van por Gemini (URLs y Base64)
    if (item.type === "image") {
      return true;
    }

    // 2. Audio, video, documentos densos
    if (["audio", "video", "document"].includes(item.type)) {
      return true;
    }

    // 3. Documentos complejos (INCLUYENDO PDFs - Gemini los soporta)
    if (
      item.extension &&
      ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf"].includes(
        item.extension,
      )
    ) {
      return true;
    }

    // 4. Contenido que requiere percepcion especializada
    if (
      item.internalType === "document" &&
      item.extension &&
      ["xlsx", "csv"].includes(item.extension)
    ) {
      return true;
    }

    // 5. PDFs por MIME type (application/pdf)
    if (item.mimeType && item.mimeType.includes("pdf")) {
      return true;
    }

    return false;
  });
}

/**
 * Determina qué contenido necesita procesamiento local.
 * PDFs pequeños pueden procesarse localmente para optimizar costos y latencia.
 */
export async function getLocalProcessingContent(
  content: DetectedContent[],
): Promise<DetectedContent[]> {
  const useLocalProcessing = process.env.PDF_LOCAL_PROCESSING === "true";
  const maxLocalSizeMB = parseInt(process.env.PDF_LOCAL_MAX_SIZE_MB || "1");
  const maxLocalSizeBytes = maxLocalSizeMB * 1024 * 1024;

  if (!useLocalProcessing) {
      return []; // Todo va a Gemini
  }

  const localContent: DetectedContent[] = [];

  for (const item of content) {
    // Solo PDFs para procesamiento local
    const isPDF =
      item.internalType === "pdf" ||
      (item.extension && item.extension === "pdf") ||
      (item.mimeType && item.mimeType.includes("pdf"));

    if (!isPDF) {
      continue; // Solo PDFs van local
    }

    // Determinar tamaño del archivo
    let fileSizeBytes = 0;

    if (
      item.source.startsWith("http://") ||
      item.source.startsWith("https://")
    ) {
      // Para URLs: obtener tamaño con HEAD request
      try {
        const { downloader } = await import("../utils/downloader");
        const fileInfo = await downloader.getFileInfo(item.source);
        fileSizeBytes = fileInfo.size;
        logger.info(
          `📄 PDF URL detectado: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB (${item.source.substring(0, 80)}...)`,
        );
      } catch (error) {
        logger.warn(
          `No se pudo obtener tamaño de PDF URL: ${item.source.substring(0, 80)}...`,
        );
        continue;
      }
    } else if (item.source.startsWith("data:")) {
      try {
        const base64Data = item.source.split(",")[1] || "";
        fileSizeBytes = Math.floor((base64Data.length * 3) / 4);
      } catch (error) {
        logger.warn(`No se pudo calcular tamaño de PDF Base64`);
        continue;
      }
    } else {
      // Para archivos locales: necesitaríamos fs.stat, pero no tenemos acceso
      // Por ahora, asumimos que archivos locales son pequeños
      logger.info(
        `📄 PDF local detectado (asumiendo pequeño): ${item.source.substring(0, 80)}...`,
      );
      localContent.push(item);
      continue;
    }

    // Decidir routing basado en tamaño
    if (fileSizeBytes > 0 && fileSizeBytes <= maxLocalSizeBytes) {
      logger.info(
        `✓ PDF pequeño (${(fileSizeBytes / 1024).toFixed(1)}KB) → procesamiento local`,
      );
      localContent.push(item);
    } else if (fileSizeBytes > maxLocalSizeBytes) {
      logger.info(
        `PDF grande (${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB) -> Gemini`,
      );
      // PDF grande va a Gemini, no lo agregamos a localContent
    } else {
      // Tamano desconocido: por seguridad, va a Gemini
      logger.info(`? PDF tamano desconocido -> Gemini (mas seguro)`);
    }
  }

  return localContent;
}
