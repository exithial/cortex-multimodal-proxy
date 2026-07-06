import axios from "axios";
import { logger } from "../utils/logger";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "../types/openai";
import type { BrainModelEntry } from "./brainRegistry";
import {
  prepareMessages,
  truncateMessages,
} from "./messageTransforms";

const OPENCODE_GO_API_KEY = process.env.OPENCODE_GO_API_KEY || "";
const OPENCODE_GO_BASE_URL =
  process.env.OPENCODE_GO_BASE_URL || "https://opencode.ai/zen/go/v1";
const OPENCODE_GO_TIMEOUT_MS = parseInt(
  process.env.OPENCODE_GO_TIMEOUT_MS || "120000",
);

if (!OPENCODE_GO_API_KEY) {
  throw new Error("OPENCODE_GO_API_KEY no configurado en .env");
}

class OpenCodeGoService {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.apiKey = OPENCODE_GO_API_KEY;
    this.baseUrl = OPENCODE_GO_BASE_URL;
    this.timeout = OPENCODE_GO_TIMEOUT_MS;
  }

  resolveEndpointUrl(endpoint: "openai" | "anthropic"): string {
    if (endpoint === "anthropic") {
      return `${this.baseUrl}/messages`;
    }
    return `${this.baseUrl}/chat/completions`;
  }

  buildPayload(
    request: ChatCompletionRequest,
    upstreamModel: string,
    thinking: boolean,
    maxContextTokens: number,
  ): any {
    const validMessages = prepareMessages(request.messages, thinking);
    const truncatedMessages = truncateMessages(validMessages, maxContextTokens);

    const payload: any = {
      model: upstreamModel,
      messages: truncatedMessages,
      stream: request.stream || false,
    };

    if (request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }
    if (request.max_tokens !== undefined) {
      payload.max_tokens = request.max_tokens;
    }
    if (request.tools) {
      payload.tools = request.tools;
    }
    if (request.tool_choice !== undefined) {
      payload.tool_choice = request.tool_choice;
    }
    if (request.response_format !== undefined) {
      payload.response_format = request.response_format;
    }

    return payload;
  }

  async createChatCompletion(
    request: ChatCompletionRequest,
    brainEntry: BrainModelEntry,
  ): Promise<ChatCompletionResponse> {
    const payload = this.buildPayload(
      request,
      brainEntry.upstream,
      brainEntry.thinking,
      brainEntry.context,
    );
    const url = this.resolveEndpointUrl(brainEntry.endpoint);

    logger.info(
      `OpenCode Go: POST ${url} | model: ${brainEntry.upstream} | thinking: ${brainEntry.thinking}`,
    );

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: this.timeout,
    });

    return response.data;
  }

  async chatCompletionStream(
    request: ChatCompletionRequest,
    brainEntry: BrainModelEntry,
    onChunk: (chunk: string) => void,
    onError: (error: unknown) => void,
    onComplete: () => void,
  ): Promise<void> {
    const payload = this.buildPayload(
      request,
      brainEntry.upstream,
      brainEntry.thinking,
      brainEntry.context,
    );
    payload.stream = true;
    const url = this.resolveEndpointUrl(brainEntry.endpoint);

    logger.info(
      `OpenCode Go (stream): POST ${url} | model: ${brainEntry.upstream}`,
    );

    try {
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: this.timeout,
        responseType: "stream",
      });

      const stream = response.data;

      let buffer = "";
      let streamEnded = false;
      const safeEnd = () => {
        if (!streamEnded) {
          streamEnded = true;
          onComplete();
        }
      };

      stream.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim() === "") continue;

          if (line.startsWith("data: ")) {
            const data = line.substring(6);
            if (data === "[DONE]") {
              safeEnd();
              return;
            }

            try {
              JSON.parse(data);
              onChunk(`data: ${data}\n\n`);
            } catch (error) {
              logger.warn(
                `JSON parsing error, skipping incomplete chunk: ${data.substring(0, 100)}...`,
              );
            }
          }
        }
      });

      stream.on("end", () => safeEnd());
      stream.on("error", (error: unknown) => onError(error));
    } catch (error: unknown) {
      onError(error);
    }
  }
}

export const opencodeGoService = new OpenCodeGoService();
