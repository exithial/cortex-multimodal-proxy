import axios from "axios";
import { logger } from "../utils/logger";
import type {
  VisionContentType,
  VisionProvider,
} from "./visionProvider";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "";
const MINIMAX_BASE_URL =
  process.env.MINIMAX_BASE_URL || "https://api.minimax.io/anthropic";
const SENSES_MODEL = process.env.SENSES_MODEL || "MiniMax-M3";
const SENSES_TIMEOUT_MS = parseInt(process.env.SENSES_TIMEOUT_MS || "120000");

if (!MINIMAX_API_KEY) {
  throw new Error("MINIMAX_API_KEY no configurado en .env");
}

const IMAGE_PROMPT =
  process.env.SENSES_IMAGE_PROMPT ||
  `Describe esta imagen con precisión técnica para que un programador ciego pueda recrearla.
INSTRUCCIONES ESPECÍFICAS:
1. Si es una INTERFAZ DE USUARIO: Describe layout, elementos, botones, colores, texto visible, jerarquía visual.
2. Si es un DIAGRAMA DE ARQUITECTURA: Describe componentes, conexiones, flujo de datos, relaciones.
3. Si es una CAPTURA DE ERROR: Describe mensajes de error, stack traces, contexto visual.
4. Si contiene TEXTO: Transcribe TODO el texto visible preservando estructura.
5. Sé LITERAL y PRECISO: No interpretes, solo describe.`;

class MiniMaxM3VisionProvider implements VisionProvider {
  readonly name = "minimax-m3";
  private readonly supportedTypes = new Set<VisionContentType>(["image", "video"]);

  isAvailable(): boolean {
    return !!MINIMAX_API_KEY;
  }

  supportsContentType(type: VisionContentType): boolean {
    return this.supportedTypes.has(type);
  }

  async describeImage(
    imageUrl: string,
    userContext: string = "",
  ): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error("MINIMAX_API_KEY no configurado en .env");
    }

    const prompt = userContext
      ? `${IMAGE_PROMPT}\n\nContexto del usuario: ${userContext}`
      : IMAGE_PROMPT;

    const payload = {
      model: SENSES_MODEL,
      messages: [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: prompt },
            {
              type: "image" as const,
              source: { type: "url" as const, url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 4096,
      stream: false,
    };

    logger.info(
      `MiniMax M3: Describiendo imagen con ${SENSES_MODEL}...`,
    );

    let lastError: unknown;
    const maxRetries = 3;
    const baseDelay = 2000;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${MINIMAX_BASE_URL}/v1/messages`,
          payload,
          {
            headers: {
              "x-api-key": MINIMAX_API_KEY,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
              Authorization: `Bearer ${MINIMAX_API_KEY}`,
            },
            timeout: SENSES_TIMEOUT_MS,
          },
        );

        const blocks = response.data.content;
        if (!Array.isArray(blocks)) {
          throw new Error("MiniMax M3: respuesta sin bloque content");
        }
        const text = blocks
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("\n");
        if (!text) {
          throw new Error("MiniMax M3: respuesta vacía");
        }
        const usage = response.data.usage;
        if (usage) {
          logger.info(
            `MiniMax M3: in=${usage.input_tokens} out=${usage.output_tokens}`,
          );
        }
        return text;
      } catch (error: unknown) {
        lastError = error;
        const status = axios.isAxiosError(error) ? error.response?.status : 0;
        const isRetryable = status === 503 || status === 502 || status === 429;
        if (!isRetryable || attempt === maxRetries) throw error;
        const retryAfter = axios.isAxiosError(error)
          ? parseInt(error.response?.headers?.["retry-after"] || "0") * 1000
          : 0;
        const delay = retryAfter || baseDelay * Math.pow(2, attempt - 1);
        logger.warn(
          `MiniMax M3: ${status}, reintento ${attempt}/${maxRetries} en ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }
}

export const minimaxM3VisionProvider = new MiniMaxM3VisionProvider();
