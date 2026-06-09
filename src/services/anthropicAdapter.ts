import type {
  AnthropicRequest,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicTool,
  AnthropicStreamEvent,
} from "../types/anthropic";
import type {
  ChatCompletionRequest,
  ChatMessage,
  MessageContent,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from "../types/openai";
import { logger } from "../utils/logger";

class AnthropicAdapter {
  mapClaudeModelToInternal(claudeModel: string): string {
    const mapping: Record<string, string> = {
      haiku: "vision-direct",
      sonnet: "deepseek-multimodal-flash",
      opus: "deepseek-multimodal-pro",
    };

    const mapped = mapping[claudeModel];
    if (!mapped) {
      logger.warn(
        `Modelo Claude desconocido: ${claudeModel}, usando deepseek-multimodal-flash`,
      );
      return "deepseek-multimodal-flash";
    }

    logger.info(`Mapeo: ${claudeModel} -> ${mapped}`);
    return mapped;
  }

  anthropicToInternal(request: AnthropicRequest): ChatCompletionRequest {
    logger.info("Traduciendo request Anthropic -> OpenAI");

    const internalModel = this.mapClaudeModelToInternal(request.model);

    const messages: ChatMessage[] = [];

    if (request.system) {
      messages.push({
        role: "system",
        content: request.system,
      });
    }

    for (const anthropicMsg of request.messages) {
      const openaiMsg: ChatMessage = {
        role: anthropicMsg.role,
        content: this.convertAnthropicContent(anthropicMsg.content),
      };

      if (Array.isArray(anthropicMsg.content)) {
        const toolUses = anthropicMsg.content.filter(
          (block) => block.type === "tool_use",
        );
        if (toolUses.length > 0) {
          openaiMsg.tool_calls = toolUses.map((block) => ({
            id: block.id!,
            type: "function",
            function: {
              name: block.name!,
              arguments: JSON.stringify(block.input),
            },
          }));
        }

        const toolResults = anthropicMsg.content.filter(
          (block) => block.type === "tool_result",
        );
        if (toolResults.length > 0) {
          for (const toolResult of toolResults) {
            messages.push({
              role: "tool",
              content:
                typeof toolResult.content === "string"
                  ? toolResult.content
                  : JSON.stringify(toolResult.content),
              tool_call_id: toolResult.tool_use_id!,
            });
          }
          continue;
        }

        const thinkingBlocks = anthropicMsg.content.filter(
          (block) => block.type === "thinking",
        );
        if (thinkingBlocks.length > 0) {
          openaiMsg.reasoning_content = thinkingBlocks
            .map((block) => block.thinking)
            .join("\n");
        }
      }

      messages.push(openaiMsg);
    }

    let tools: any[] | undefined = undefined;
    if (request.tools) {
      tools = request.tools.map((tool) => this.anthropicToolToOpenAI(tool));
    }

    const openaiRequest: ChatCompletionRequest = {
      model: internalModel,
      messages,
      temperature: request.temperature,
      top_p: request.top_p,
      max_tokens: request.max_tokens,
      stream: request.stream || false,
      stop: request.stop_sequences,
      tools,
    };

    logger.debug(`Mensajes traducidos: ${messages.length} mensaje(s)`);
    return openaiRequest;
  }

  private convertAnthropicContent(
    content: string | AnthropicContentBlock[],
  ): string | MessageContent[] {
    if (typeof content === "string") {
      return content;
    }

    const openaiContent: MessageContent[] = [];

    for (const block of content) {
      if (block.type === "text") {
        if (block.text) {
          openaiContent.push({
            type: "text",
            text: block.text,
          });
        }
      } else if (block.type === "image") {
        if (block.source) {
          if (block.source.type === "base64") {
            openaiContent.push({
              type: "image_url",
              image_url: {
                url: `data:${block.source.media_type};base64,${block.source.data}`,
              },
            });
          } else if (block.source.type === "url") {
            openaiContent.push({
              type: "image_url",
              image_url: {
                url: block.source.data,
              },
            });
          }
        } else if (block.url) {
          openaiContent.push({
            type: "image_url",
            image_url: {
              url: block.url,
            },
          });
        }
      } else if (block.type === "audio_url") {
        if (block.url) {
          openaiContent.push({
            type: "audio_url",
            audio_url: {
              url: block.url,
              format: block.format,
            },
          });
        }
      } else if (block.type === "video_url") {
        if (block.url) {
          openaiContent.push({
            type: "video_url",
            video_url: {
              url: block.url,
              format: block.format,
            },
          });
        }
      } else if (block.type === "document_url") {
        if (block.url) {
          openaiContent.push({
            type: "document_url",
            document_url: {
              url: block.url,
              format: block.format,
            },
          });
        }
      } else if (block.type === "input_audio") {
        if (block.url || (block as any).data) {
          const audioData = (block as any).data || block.url;
          const audioFormat = block.format || "mp3";
          openaiContent.push({
            type: "audio_url",
            audio_url: {
              url: audioData,
              format: audioFormat,
            },
          });
        }
      } else if (block.type === "clipboard") {
        if ((block as any).data) {
          const clipboardData = (block as any).data;
          if (typeof clipboardData === "string" && clipboardData.startsWith("data:image")) {
            openaiContent.push({
              type: "image_url",
              image_url: {
                url: clipboardData,
              },
            });
          }
        }
      } else if ((block as any).type === "image" && (block as any).data) {
        const imageData = (block as any).data;
        if (typeof imageData === "string" && imageData.startsWith("data:image")) {
          openaiContent.push({
            type: "image_url",
            image_url: {
              url: imageData,
            },
          });
        } else if (typeof imageData === "string") {
          openaiContent.push({
            type: "image_url",
            image_url: {
              url: imageData,
            },
          });
        }
      }
    }

    if (openaiContent.length === 0) {
      return "";
    }

    if (openaiContent.length === 1 && openaiContent[0].type === "text") {
      return openaiContent[0].text!;
    }

    return openaiContent;
  }

  private anthropicToolToOpenAI(tool: AnthropicTool): any {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: this.cleanJSONSchemaForAnthropic(tool.input_schema),
      },
    };
  }

  private cleanJSONSchemaForAnthropic(schema: any): any {
    if (!schema || typeof schema !== "object") return schema;

    const cleaned = { ...schema };

    delete cleaned.$schema;
    delete cleaned.$defs;
    delete cleaned.additionalProperties;
    delete cleaned.$ref;
    delete cleaned.const;

    if (cleaned.properties) {
      for (const key in cleaned.properties) {
        cleaned.properties[key] = this.cleanJSONSchemaForAnthropic(
          cleaned.properties[key],
        );
      }
    }

    return cleaned;
  }

  internalToAnthropic(
    openaiResponse: ChatCompletionResponse,
    originalModel: string,
  ): AnthropicMessage {
    logger.info("Traduciendo response OpenAI -> Anthropic");

    const choice = openaiResponse.choices[0];
    const message = choice.message;

    const content: AnthropicContentBlock[] = [];

    if ((message as any).reasoning_content) {
      content.push({
        type: "thinking",
        thinking: (message as any).reasoning_content,
      });
    }

    if (message.content) {
      content.push({
        type: "text",
        text: message.content as string,
      });
    }

    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        content.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments),
        });
      }
    }

    let stopReason: AnthropicMessage["stop_reason"] = "end_turn";
    if (choice.finish_reason === "length") stopReason = "max_tokens";
    else if (choice.finish_reason === "tool_calls") stopReason = "tool_use";

    const anthropicResponse: AnthropicMessage = {
      id: openaiResponse.id,
      type: "message",
      role: "assistant",
      content,
      model: originalModel,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: openaiResponse.usage?.prompt_tokens || 0,
        output_tokens: openaiResponse.usage?.completion_tokens || 0,
      },
    };

    return anthropicResponse;
  }

  async *createAnthropicStream(
    openaiChunks: AsyncGenerator<string>,
    originalModel: string,
    requestId: string,
    onComplete?: (content: string) => void,
  ): AsyncGenerator<string> {
    logger.info("Creando stream Anthropic desde chunks OpenAI");

    let firstChunk = true;
    let totalContent = "";

    try {
      for await (const chunk of openaiChunks) {
        if (chunk.startsWith("data: [DONE]")) {
          break;
        }

        if (!chunk.startsWith("data: ")) continue;

        const jsonStr = chunk.slice(6);
        let parsed: ChatCompletionChunk;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        const delta = parsed.choices[0]?.delta;
        if (!delta) continue;

        if (firstChunk) {
          const messageStart: AnthropicStreamEvent = {
            type: "message_start",
            message: {
              id: requestId,
              type: "message",
              role: "assistant",
              model: originalModel,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          };
          yield `event: message_start\ndata: ${JSON.stringify(messageStart)}\n\n`;

          const contentBlockStart: AnthropicStreamEvent = {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          };
          yield `event: content_block_start\ndata: ${JSON.stringify(contentBlockStart)}\n\n`;

          firstChunk = false;
        }

        if (delta.content) {
          totalContent += delta.content;

          const contentDelta: AnthropicStreamEvent = {
            type: "content_block_delta",
            index: 0,
            delta: {
              type: "text_delta",
              text: delta.content,
            },
          };
          yield `event: content_block_delta\ndata: ${JSON.stringify(contentDelta)}\n\n`;
        }

        if (parsed.choices[0]?.finish_reason) {
          const contentBlockStop: AnthropicStreamEvent = {
            type: "content_block_stop",
            index: 0,
          };
          yield `event: content_block_stop\ndata: ${JSON.stringify(contentBlockStop)}\n\n`;

          const messageDelta: AnthropicStreamEvent = {
            type: "message_delta",
            delta: {},
            usage: { output_tokens: Math.ceil(totalContent.length / 4) },
          };
          yield `event: message_delta\ndata: ${JSON.stringify(messageDelta)}\n\n`;
        }
      }

      const messageStop: AnthropicStreamEvent = {
        type: "message_stop",
      };
      yield `event: message_stop\ndata: ${JSON.stringify(messageStop)}\n\n`;
      if (onComplete) onComplete(totalContent);
    } catch (error: any) {
      logger.error("Error en stream Anthropic:", error);
      const errorEvent: AnthropicStreamEvent = {
        type: "error",
      };
      yield `event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`;
    }
  }

  mapReasoningToThinking(reasoningContent: string): AnthropicContentBlock {
    return {
      type: "thinking",
      thinking: reasoningContent,
    };
  }
}

export const anthropicAdapter = new AnthropicAdapter();
