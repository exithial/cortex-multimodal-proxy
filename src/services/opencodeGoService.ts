import axios from "axios";
import { logger } from "../utils/logger";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from "../types/openai";
import type { BrainModelEntry } from "./brainRegistry";

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

  private truncateMessages(
    messages: ChatMessage[],
    maxContextTokens: number,
  ): ChatMessage[] {
    const estimateTokens = (text: string | null) =>
      Math.ceil((text || "").length / 3);

    const systemMessages = messages.filter((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    let systemTokens = systemMessages.reduce((sum, msg) => {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      return sum + estimateTokens(content);
    }, 0);

    if (systemTokens > maxContextTokens * 0.3) {
      systemMessages.splice(1);
      const content =
        typeof systemMessages[0]?.content === "string"
          ? systemMessages[0].content
          : JSON.stringify(systemMessages[0]?.content);
      systemTokens = estimateTokens(content);
    }

    const result = [...systemMessages];
    let currentTokens = systemTokens;
    const maxTokensForHistory = maxContextTokens - systemTokens;

    for (let i = otherMessages.length - 1; i >= 0; i--) {
      const msg = otherMessages[i];
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      const msgTokens = estimateTokens(content);

      if (currentTokens + msgTokens > maxTokensForHistory) {
        break;
      }

      result.splice(systemMessages.length, 0, msg);
      currentTokens += msgTokens;
    }

    return result;
  }

  private prepareMessages(
    messages: ChatMessage[],
    thinking: boolean,
  ): any[] {
    return messages
      .filter((msg) =>
        ["system", "user", "assistant", "tool"].includes(msg.role),
      )
      .map((msg) => {
        const prepared: any = {
          role: msg.role,
          content:
            msg.content === null
              ? null
              : typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content),
        };
        if (msg.name) prepared.name = msg.name;
        if (msg.tool_calls) prepared.tool_calls = msg.tool_calls;
        if (msg.tool_call_id) prepared.tool_call_id = msg.tool_call_id;
        if (thinking && msg.reasoning_content !== undefined) {
          prepared.reasoning_content = msg.reasoning_content;
        }
        return prepared;
      });
  }

  buildPayload(
    request: ChatCompletionRequest,
    upstreamModel: string,
    thinking: boolean,
  ): any {
    const validMessages = this.prepareMessages(request.messages, thinking);
    const truncatedMessages = this.truncateMessages(validMessages, 1048576);

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

      stream.on("data", (chunk: Buffer) => {
        onChunk(chunk.toString());
      });

      stream.on("end", () => {
        onComplete();
      });

      stream.on("error", (error: unknown) => {
        onError(error);
      });
    } catch (error: unknown) {
      onError(error);
    }
  }
}

export const opencodeGoService = new OpenCodeGoService();