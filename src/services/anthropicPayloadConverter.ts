import type { ChatCompletionRequest } from "../types/openai";

export function openAIToAnthropicPayload(
  request: ChatCompletionRequest,
  upstreamModel: string,
  validMessages: any[],
  stream: boolean,
  thinking: boolean,
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
  if (thinking) {
    const budgetTokens = Math.max(1024, Math.floor(payload.max_tokens / 4));
    payload.thinking = {
      type: "enabled",
      budget_tokens: budgetTokens,
    };
    if (!payload.max_tokens || payload.max_tokens < budgetTokens + 1024) {
      payload.max_tokens = budgetTokens + 4096;
    }
  }

  return payload;
}