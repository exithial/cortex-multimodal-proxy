import type { ChatMessage, MessageContent } from "../types/openai";
import { logger } from "../utils/logger";
import { geminiService } from "../services/geminiService";
import { mimoSensesService } from "../services/mimoSensesService";
import { pdfProcessor } from "../utils/pdfProcessor";
import { getErrorMessage } from "../utils/error";
import { isPassthrough } from "../services/brainRegistry";
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
): Promise<{
  processedMessages: ChatMessage[];
  useDeepseekDirectly: boolean;
  strategy: "direct" | "vision" | "vision-mimo" | "local" | "mixed" | "vision-direct";
}> {
  if (modelName === "vision-direct") {
    logger.info(
      "Modelo vision-direct detectado - Usando Gemini para respuesta completa",
    );

    const geminiResponse = await geminiService.generateDirectResponse(messages);

    return {
      processedMessages: [
        {
          role: "assistant",
          content: geminiResponse,
        },
      ],
      useDeepseekDirectly: false,
      strategy: "vision-direct",
    };
  }

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

  const useMimoForImages =
    !!modelName &&
    modelName.startsWith("proxy/") &&
    mimoSensesService.isAvailable();
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

  const userContext = extractUserContext(messages);
  logger.debug(`Contexto del usuario: "${userContext.substring(0, 100)}..."`);

  const startTime = Date.now();

  const visionDescriptions = await Promise.all(
    visionContent.map(async (content, index) => {
      const useMimo = useMimoForImages && content.type === "image";
      const processor = useMimo ? "MiMo V2.5" : "Gemini";
      logger.info(
        `Procesando ${content.type} ${index + 1}/${visionContent.length} con ${processor}...`,
      );
      try {
        if (useMimo) {
          return await mimoSensesService.describeImage(
            content.source,
            userContext,
          );
        }
        return await geminiService.analyzeContent(content, userContext);
      } catch (error: unknown) {
        if (useMimo) {
          logger.warn(
            `MiMo V2.5 fallo para ${content.type} ${index + 1}: ${getErrorMessage(error)}. Fallback a Gemini...`,
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

  const usedMimo = visionContent.some(
    (c) => c.type === "image" && useMimoForImages,
  );
  let strategy:
    | "direct"
    | "vision"
    | "vision-mimo"
    | "local"
    | "mixed"
    | "vision-direct" = "mixed";
  if (visionContent.length > 0 && localContent.length === 0)
    strategy = usedMimo ? "vision-mimo" : "vision";
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
