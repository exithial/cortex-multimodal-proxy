import type { ChatMessage } from "../types/openai";

export function truncateMessages(
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

export function prepareMessages(
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
