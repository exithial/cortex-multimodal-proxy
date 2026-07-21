import axios from "axios";
import { logger } from "../utils/logger";
import type {
  VisionProvider,
  VisionContentType,
} from "./visionProvider";

const SENSES_MODEL = process.env.SENSES_MODEL || "mimo-v2.5";
const OPENCODE_GO_BASE_URL =
  process.env.OPENCODE_GO_BASE_URL || "https://opencode.ai/zen/go/v1";
const OPENCODE_GO_API_KEY = process.env.OPENCODE_GO_API_KEY || "";
const SENSES_TIMEOUT_MS = parseInt(process.env.SENSES_TIMEOUT_MS || "120000");

const IMAGE_PROMPT =
  process.env.SENSES_IMAGE_PROMPT ||
  `Describe esta imagen con precisión técnica para que un programador ciego pueda recrearla.
INSTRUCCIONES ESPECÍFICAS:
1. Si es una INTERFAZ DE USUARIO: Describe layout, elementos, botones, colores, texto visible, jerarquía visual.
2. Si es un DIAGRAMA DE ARQUITECTURA: Describe componentes, conexiones, flujo de datos, relaciones.
3. Si es una CAPTURA DE ERROR: Describe mensajes de error, stack traces, contexto visual.
4. Si contiene TEXTO: Transcribe TODO el texto visible preservando estructura.
5. Sé LITERAL y PRECISO: No interpretes, solo describe.`;

class MimoSensesVisionProvider implements VisionProvider {
  readonly name = "mimo-v2.5-senses";
  private readonly supportedTypes = new Set<VisionContentType>(["image"]);

  isAvailable(): boolean {
    return !!OPENCODE_GO_API_KEY;
  }

  supportsContentType(type: VisionContentType): boolean {
    return this.supportedTypes.has(type);
  }

  async describeImage(
    imageUrl: string,
    userContext: string = "",
  ): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error("OPENCODE_GO_API_KEY no configurado en .env");
    }

    const prompt = userContext
      ? `${IMAGE_PROMPT}\n\nContexto del usuario: ${userContext}`
      : IMAGE_PROMPT;

    const imagePart = {
      type: "image_url" as const,
      image_url: { url: imageUrl },
    };

    const payload = {
      model: SENSES_MODEL,
      messages: [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: prompt },
            imagePart,
          ],
        },
      ],
      stream: false,
    };

    logger.info(
      `MiMo Senses: Describiendo imagen con ${SENSES_MODEL}...`,
    );

    const response = await axios.post(
      `${OPENCODE_GO_BASE_URL}/chat/completions`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${OPENCODE_GO_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: SENSES_TIMEOUT_MS,
      },
    );

    const content = response.data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("MiMo Senses: Respuesta vacía del modelo");
    }

    const usage = response.data.usage;
    if (usage) {
      logger.info(
        `MiMo Senses: ${usage.total_tokens} tokens (${usage.prompt_tokens} in, ${usage.completion_tokens} out)`,
      );
    }

    return content;
  }

  async describeVideo(
    _videoUrl: string,
    _userContext: string = "",
  ): Promise<string> {
    throw new Error("MiMo Senses: video not supported");
  }
}

export const mimoSensesVisionProvider = new MimoSensesVisionProvider();
