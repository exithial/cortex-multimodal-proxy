import type { ChatMessage, MessageContent } from "../types/openai";
import { logger } from "../utils/logger";
import { geminiService } from "../services/geminiService";
import { pdfProcessor } from "../utils/pdfProcessor";
import { getErrorMessage } from "../utils/error";
import {
  isPassthrough,
  getBrainEntry,
  type BrainModelEntry,
} from "../services/brainRegistry";
import { getActiveVisionProvider } from "../services/providerSelector";
import type {
  VisionProvider,
  VisionContentType,
} from "../services/visionProvider";
import {
  detectMultimodalContent,
  extractUserContext,
  getDeepseekSupportedContent,
  getVisionRequiredContent,
  getLocalProcessingContent,
} from "./multimodalDetector";

export async function processMultimodalContent(
  messages: ChatMessage[],
  modelName?: string,
  brainEntry?: BrainModelEntry,
  visionProvider?: VisionProvider | null,
): Promise<{
  processedMessages: ChatMessage[];
  useDeepseekDirectly: boolean;
  strategy: "direct" | "vision" | "vision-mimo" | "local" | "mixed";
}> {
  if (modelName && isPassthrough(modelName)) {
    logger.info(
      `Modelo passthrough ${modelName} - sin procesamiento multimodal`,
    );
    return {
      processedMessages: messages,
      useDeepseekDirectly: true,
      strategy: "direct",
    };
  }

  const resolvedBrain = brainEntry ?? (modelName ? getBrainEntry(modelName) : undefined);
  const isMultimodalNative = resolvedBrain?.multimodal === true;
  const activeVision = visionProvider ?? getActiveVisionProvider();
  const imageVisionProvider = activeVision ?? undefined;
  // 1. Detectar contenido
  const analysis = await detectMultimodalContent(messages);

  if (analysis.hasOnlyText) {
    logger.debug("✓ Solo texto detectado - Passthrough directo a DeepSeek");
    return {
      processedMessages: messages,
      useDeepseekDirectly: true,
      strategy: "direct",
    };
  }

  logger.info(
    `📊 Contenido detectado: ${analysis.detectedContent.length} elemento(s)`,
  );
  analysis.detectedContent.forEach((content, i) => {
    logger.info(
      `  → ${i + 1}. ${content.type} (${content.mimeType || "sin tipo"}): ${content.source.substring(0, 80)}...`,
    );
  });

  // 2. Separar contenido por destino
  const deepseekContent = getDeepseekSupportedContent(analysis.detectedContent);
  const visionContent = await getVisionRequiredContent(
    analysis.detectedContent,
  );
  const localContent = await getLocalProcessingContent(
    analysis.detectedContent,
  );

  logger.info(`  → DeepSeek directo: ${deepseekContent.length} elemento(s)`);
  logger.info(`  → Gemini vision: ${visionContent.length} elemento(s)`);
  logger.info(`  → Procesamiento local: ${localContent.length} elemento(s)`);

  // 3. Si no hay contenido que procesar con Gemini ni localmente, usar DeepSeek directamente
  if (visionContent.length === 0 && localContent.length === 0) {
    logger.info(
      "Todo el contenido soportado por DeepSeek - Passthrough directo",
    );
    return {
      processedMessages: messages,
      useDeepseekDirectly: true,
      strategy: "direct",
    };
  }

  // 3b. Brain multimodal nativo: filtrar visionContent para solo imagenes;
  //     audio/video/PDF siguen requiriendo Gemini.
  if (isMultimodalNative && visionContent.length > 0) {
    const imageContent = visionContent.filter((c) => c.type === "image");
    const nonImageContent = visionContent.filter((c) => c.type !== "image");
    if (imageContent.length > 0 && nonImageContent.length === 0 && localContent.length === 0) {
      logger.info(
        `Brain multimodal nativo: ${imageContent.length} imagen(es) pasa(n) directo al brain, sin MiMo senses`,
      );
      return {
        processedMessages: messages,
        useDeepseekDirectly: true,
        strategy: "direct",
      };
    }
  }

  const userContext = extractUserContext(messages);
  logger.debug(`Contexto del usuario: "${userContext.substring(0, 100)}..."`);

  const startTime = Date.now();

  const visionDescriptions = await Promise.all(
    visionContent.map(async (content, index) => {
      const vision =
        imageVisionProvider &&
        imageVisionProvider.supportsContentType(content.type as VisionContentType)
          ? imageVisionProvider
          : null;
      const processor = vision
        ? vision.name === "mimo-v2.5-senses"
          ? "MiMo V2.5"
          : vision.name === "minimax-m3"
            ? "MiniMax M3"
            : "Vision"
        : "Gemini";
      logger.info(
        `Procesando ${content.type} ${index + 1}/${visionContent.length} con ${processor}...`,
      );
      try {
        if (vision && content.type === "image") {
          return await vision.describeImage(content.source, userContext);
        }
        return await geminiService.analyzeContent(content, userContext);
      } catch (error: unknown) {
        if (vision) {
          logger.warn(
            `${vision.name} fallo para ${content.type} ${index + 1}: ${getErrorMessage(error)}. Fallback a Gemini...`,
          );
          return await geminiService.analyzeContent(content, userContext);
        }
        logger.error(
          `Error procesando ${content.type} ${index + 1} con Gemini: ${getErrorMessage(error)}`,
        );
        throw error;
      }
    }),
  );

  // Procesar contenido localmente (PDFs) con fallback a Gemini
  const localDescriptions = await Promise.all(
    localContent.map(async (content, index) => {
      logger.info(
        `Procesando ${content.type} ${index + 1}/${localContent.length} localmente...`,
      );
      try {
        const { downloader } = await import("../utils/downloader");
        const validation = await downloader.validateFile(content.source);

        if (!validation.valid) {
          throw new Error(`Archivo no valido: ${validation.reason}`);
        }

        logger.info(
          `Archivo validado: ${(validation.size! / 1024 / 1024).toFixed(2)}MB, ${validation.contentType}`,
        );

        const { buffer } = await downloader.downloadFile(content.source);

        return await pdfProcessor.analyzePDF(buffer, userContext);
      } catch (error: unknown) {
        logger.error(
          `Error procesando ${content.type} ${index + 1} localmente: ${getErrorMessage(error)}`,
        );

        logger.info(
          `Fallback a Gemini para ${content.type} ${index + 1}...`,
        );
        try {
          const { geminiService } = await import("../services/geminiService");
          return await geminiService.analyzeContent(content, userContext);
        } catch (geminiError: unknown) {
          logger.error(
            `Fallback a Gemini tambien fallo: ${getErrorMessage(geminiError)}`,
          );
          throw new Error(
            `Procesamiento local y fallback a Gemini fallaron: ${getErrorMessage(error)}`,
          );
        }
      }
    }),
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(
    `${visionContent.length + localContent.length} elemento(s) procesado(s) en ${elapsed}s (${visionContent.length} Gemini, ${localContent.length} local)`,
  );

  // 5. Reemplazar contenido procesado en los mensajes
  const processedMessages = JSON.parse(
    JSON.stringify(messages),
  ) as ChatMessage[];

  // Combinar todo el contenido procesado
  const allContent = [...visionContent, ...localContent];
  const allDescriptions = [...visionDescriptions, ...localDescriptions];

  for (let i = 0; i < allContent.length; i++) {
    const content = allContent[i];
    const description = allDescriptions[i];
    const message = processedMessages[content.messageIndex];

    if (Array.isArray(message.content) && content.contentIndex !== undefined) {
      const parts = message.content as MessageContent[];

      parts[content.contentIndex] = {
        type: "text",
        text: `[DESCRIPCIÓN ${content.type.toUpperCase()} ${i + 1}]: ${description}`,
      };

      // Consolidar todas las partes de texto
      const textParts = parts
        .filter((part) => part.type === "text" && part.text)
        .map((part) => part.text)
        .join("\n\n");

      message.content =
        textParts ||
        `[DESCRIPCIÓN ${content.type.toUpperCase()} ${i + 1}]: ${description}`;
    } else if (typeof message.content === "string") {
      message.content += `\n\n[DESCRIPCIÓN ${content.type.toUpperCase()} ${i + 1}]: ${description}`;
    }
  }

  // 6. Si hay contenido que DeepSeek puede manejar directamente, mantenerlo
  // (ya está en los mensajes originales)

  const usedActiveVision = visionContent.some(
    (c) => imageVisionProvider?.supportsContentType(c.type as VisionContentType) ?? false,
  );
  let strategy:
    | "direct"
    | "vision"
    | "vision-mimo"
    | "local"
    | "mixed" = "mixed";
  if (visionContent.length > 0 && localContent.length === 0)
    strategy = usedActiveVision ? "vision-mimo" : "vision";
  else if (visionContent.length === 0 && localContent.length > 0)
    strategy = "local";

  return { processedMessages, useDeepseekDirectly: false, strategy };
}

export async function canDeepseekHandleDirectly(
  messages: ChatMessage[],
): Promise<boolean> {
  const analysis = await detectMultimodalContent(messages);

  if (analysis.hasOnlyText) return true;

  const visionContent = await getVisionRequiredContent(
    analysis.detectedContent,
  );
  const localContent = await getLocalProcessingContent(
    analysis.detectedContent,
  );

  return visionContent.length === 0 && localContent.length === 0;
}
