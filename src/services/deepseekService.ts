import axios from "axios";
import { logger } from "../utils/logger";

import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from "../types/openai";

class DeepSeekService {
  private apiKey: string;
  private baseURL: string;
  private timeout: number;
  private contextWindow: number;
  private maxOutputTokens: number;
  private thinkingEffort: string;
  private thinkingEnabled: boolean;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || "";
    this.baseURL =
      process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
    this.timeout = parseInt(process.env.DEEPSEEK_TIMEOUT_MS || "30000");

    this.contextWindow = parseInt(
      process.env.DEEPSEEK_CONTEXT_WINDOW || "872000",
    );
    this.maxOutputTokens = parseInt(
      process.env.DEEPSEEK_MAX_OUTPUT || "384000",
    );
    this.thinkingEffort = process.env.DEEPSEEK_THINKING_EFFORT || "max";
    this.thinkingEnabled = process.env.DEEPSEEK_THINKING_ENABLED !== "false";

    if (!this.apiKey) {
      throw new Error("DEEPSEEK_API_KEY no configurado en .env");
    }

    const validEfforts = ["high", "max"];
    if (!validEfforts.includes(this.thinkingEffort)) {
      logger.warn(`DEEPSEEK_THINKING_EFFORT="${this.thinkingEffort}" invalido, usando "max"`);
      this.thinkingEffort = "max";
    }
  }

  private mapModel(proxyModel: string): { target: "deepseek"; model: string; thinking: boolean } {
    if (proxyModel === "deepseek-multimodal-pro") {
      return { target: "deepseek", model: "deepseek-v4-pro", thinking: this.thinkingEnabled };
    }

    if (proxyModel === "deepseek-multimodal-pro-nothink") {
      return { target: "deepseek", model: "deepseek-v4-pro", thinking: false };
    }

    if (proxyModel === "deepseek-multimodal-flash-nothink") {
      return { target: "deepseek", model: "deepseek-v4-flash", thinking: false };
    }

    return { target: "deepseek", model: "deepseek-v4-flash", thinking: this.thinkingEnabled };
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

  /**
   * Procesa los mensajes para asegurar que son compatibles con DeepSeek.
   * Si `thinking` es false, descarta `reasoning_content` para evitar 400
   * cuando clientes como AnthingLLM lo reenvían en el historial.
   */
  private prepareMessages(messages: ChatMessage[], thinking: boolean): any[] {
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

  /**
   * Realiza una llamada a la API de DeepSeek.
   * Este es el endpoint principal donde DeepSeek procesa el texto enriquecido
   * con descripciones de contenido multimedia generadas por Gemini.
   */
  private buildPayload(
    request: ChatCompletionRequest,
    mapped: { target: "deepseek"; model: string; thinking: boolean },
  ): any {
    const validMessages = this.prepareMessages(request.messages, mapped.thinking);
    const truncatedMessages = this.truncateMessages(validMessages, this.contextWindow);

    const payload: any = {
      model: mapped.model,
      messages: truncatedMessages,
      stream: request.stream || false,
    };

    if (mapped.thinking) {
      payload.thinking = { type: "enabled" };
      payload.reasoning_effort = this.thinkingEffort;
    }

    if (request.tools) payload.tools = request.tools;
    if (request.tool_choice) payload.tool_choice = request.tool_choice;
    if (request.temperature !== undefined) payload.temperature = request.temperature;
    if (request.top_p !== undefined) payload.top_p = request.top_p;

    const requestedMaxTokens = request.max_tokens || this.maxOutputTokens;
    payload.max_tokens = Math.min(requestedMaxTokens, this.maxOutputTokens);

    if (request.frequency_penalty !== undefined) payload.frequency_penalty = request.frequency_penalty;
    if (request.presence_penalty !== undefined) payload.presence_penalty = request.presence_penalty;
    if (request.stop !== undefined) payload.stop = request.stop;

    return payload;
  }

  async createChatCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    const mapped = this.mapModel(request.model);
    const payload = this.buildPayload(request, mapped);
    payload.stream = false;

    try {
      const response = await axios.post<ChatCompletionResponse>(
        `${this.baseURL}/chat/completions`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: this.timeout,
        },
      );
      return response.data;
    } catch (error: any) {
      this.handleError(error);
    }
  }

  /**
   * Forward del request a DeepSeek con streaming (SSE)
   */
  async chatCompletionStream(
    request: ChatCompletionRequest,
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    onEnd: () => void,
  ): Promise<void> {
    const mapped = this.mapModel(request.model);

    logger.info(
      `Forwarding to DeepSeek (model: ${mapped.model}, thinking: ${mapped.thinking}, streaming: true)`,
    );

    const payload = this.buildPayload(request, mapped);
    payload.stream = true;

    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: this.timeout,
          responseType: "stream",
        },
      );

      let buffer = "";
      let streamEnded = false;
      const safeEnd = () => {
        if (!streamEnded) {
          streamEnded = true;
          onEnd();
        }
      };

      response.data.on("data", (chunk: Buffer) => {
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
              logger.warn(`JSON parsing error, skipping incomplete chunk: ${data.substring(0, 100)}...`);
            }
          }
        }
      });

      response.data.on("error", (error: Error) => onError(error));
      response.data.on("end", () => safeEnd());
    } catch (error: any) {
      this.handleStreamError(error, onError);
    }
  }

  private handleError(error: any): never {
    if (error.response) {
      logger.error(
        `✗ DeepSeek error: ${error.response.status} - ${JSON.stringify(error.response.data)}`,
      );
      throw new Error(
        `DeepSeek API error: ${error.response.data?.error?.message || error.message}`,
      );
    } else {
      logger.error(`✗ DeepSeek request error: ${error.message}`);
      throw new Error(`DeepSeek request failed: ${error.message}`);
    }
  }

  private handleStreamError(error: any, onError: (error: Error) => void) {
    if (error.response) {
      let errorBody = "";
      if (error.response.data && typeof error.response.data.on === "function") {
        error.response.data.on("data", (chunk: Buffer) => {
          errorBody += chunk.toString();
        });
        error.response.data.on("end", () => {
          onError(
            new Error(
              `DeepSeek API error: ${error.response.status} - ${errorBody}`,
            ),
          );
        });
      } else {
        onError(
          new Error(
            `DeepSeek API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`,
          ),
        );
      }
    } else {
      onError(new Error(`DeepSeek request failed: ${error.message}`));
    }
  }
}

export const deepseekService = new DeepSeekService();
