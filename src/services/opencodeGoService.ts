import axios from "axios";
import { logger } from "../utils/logger";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
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

function openAIToAnthropicPayload(
  request: ChatCompletionRequest,
  upstreamModel: string,
  validMessages: any[],
  stream: boolean,
): any {
  const systemMsg = validMessages.find((m) => m.role === "system");
  const nonSystemMessages = validMessages.filter((m) => m.role !== "system");

  const anthropicMessages = nonSystemMessages.map((m: any) => {
    if (m.role === "tool") {
      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.tool_call_id,
            content:
              typeof m.content === "string"
                ? m.content
                : JSON.stringify(m.content),
          },
        ],
      };
    }
    if (m.role === "assistant" && m.tool_calls?.length) {
      const blocks: any[] = [];
      if (m.content) {
        blocks.push({ type: "text", text: m.content });
      }
      for (const tc of m.tool_calls) {
        let input: any = {};
        try {
          input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          input = { _raw: tc.function.arguments };
        }
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input,
        });
      }
      return { role: "assistant", content: blocks };
    }
    return {
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    };
  });

  const payload: any = {
    model: upstreamModel,
    messages: anthropicMessages,
    max_tokens: request.max_tokens || 4096,
    stream,
  };

  if (systemMsg) {
    payload.system =
      typeof systemMsg.content === "string"
        ? systemMsg.content
        : JSON.stringify(systemMsg.content);
  }
  if (request.temperature !== undefined) {
    payload.temperature = request.temperature;
  }
  if (request.tools) {
    payload.tools = request.tools.map((tool: any) => {
      if (tool.type === "function") {
        return {
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters,
        };
      }
      return tool;
    });
  }

  return payload;
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
    endpoint: "openai" | "anthropic",
  ): any {
    const validMessages = prepareMessages(request.messages, thinking);
    const truncatedMessages = truncateMessages(validMessages, maxContextTokens);

    if (endpoint === "anthropic") {
      return openAIToAnthropicPayload(
        request,
        upstreamModel,
        truncatedMessages,
        request.stream || false,
      );
    }

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
      brainEntry.endpoint,
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
      brainEntry.endpoint,
    );
    payload.stream = true;
    const url = this.resolveEndpointUrl(brainEntry.endpoint);

    logger.info(
      `OpenCode Go (stream): POST ${url} | model: ${brainEntry.upstream}`,
    );

    let buffer = "";
    let ended = false;

    const safeEnd = () => {
      if (ended) return;
      ended = true;
      onComplete();
    };

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
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("data: ")) {
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") {
              safeEnd();
              return;
            }
            try {
              JSON.parse(payload);
              onChunk(`data: ${payload}\n\n`);
            } catch {
              continue;
            }
          } else {
            onChunk(`${line}\n`);
          }
        }
      });

      stream.on("end", () => {
        if (buffer.trim()) {
          onChunk(`${buffer}\n`);
        }
        safeEnd();
      });

      stream.on("error", (error: unknown) => {
        safeEnd();
        onError(error);
      });
    } catch (error: unknown) {
      safeEnd();
      onError(error);
    }
  }
}

export const opencodeGoService = new OpenCodeGoService();
