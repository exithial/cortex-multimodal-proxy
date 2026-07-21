import { describe, it, expect } from "vitest";
import { openAIToAnthropicPayload } from "../../../src/services/anthropicPayloadConverter";
import type { ChatCompletionRequest } from "../../../src/types/openai";

describe("openAIToAnthropicPayload", () => {
  const baseRequest: ChatCompletionRequest = {
    model: "proxy/qwen3.7-max",
    messages: [{ role: "user", content: "hello" }],
  };

  it("moves system message to top-level system field", () => {
    const req: ChatCompletionRequest = {
      ...baseRequest,
      messages: [
        { role: "system", content: "you are a helpful assistant" },
        { role: "user", content: "hello" },
      ],
    };
    const out = openAIToAnthropicPayload(req, "qwen3.7-max", req.messages as any, false, false);
    expect(out.system).toBe("you are a helpful assistant");
    expect(out.messages).toHaveLength(1);
  });

  it("translates assistant tool_calls to tool_use blocks", () => {
    const req: ChatCompletionRequest = {
      ...baseRequest,
      messages: [
        { role: "user", content: "what is 2+2?" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "tc_1",
              type: "function",
              function: {
                name: "add",
                arguments: JSON.stringify({ a: 2, b: 2 }),
              },
            },
          ],
        },
      ],
    };
    const out = openAIToAnthropicPayload(
      req,
      "qwen3.7-max",
      req.messages as any,
      false,
      false,
    );
    const assistantMsg = out.messages[1];
    expect(assistantMsg.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool_use", id: "tc_1", name: "add" }),
      ]),
    );
  });

  it("translates tool role to Anthropic user tool_result block", () => {
    const req: ChatCompletionRequest = {
      ...baseRequest,
      messages: [
        { role: "user", content: "compute" },
        {
          role: "tool",
          tool_call_id: "tc_1",
          content: "4",
        },
      ],
    };
    const out = openAIToAnthropicPayload(
      req,
      "qwen3.7-max",
      req.messages as any,
      false,
      false,
    );
    expect(out.messages[1].role).toBe("user");
    expect(out.messages[1].content[0].type).toBe("tool_result");
    expect(out.messages[1].content[0].tool_use_id).toBe("tc_1");
  });

  it("adds thinking block with budget_tokens when thinking=true", () => {
    const out = openAIToAnthropicPayload(
      baseRequest,
      "qwen3.7-max",
      baseRequest.messages as any,
      false,
      true,
    );
    expect(out.thinking).toBeDefined();
    expect(out.thinking.type).toBe("enabled");
    expect(out.thinking.budget_tokens).toBeGreaterThanOrEqual(1024);
  });

  it("omits thinking block when thinking=false", () => {
    const out = openAIToAnthropicPayload(
      baseRequest,
      "qwen3.7-max",
      baseRequest.messages as any,
      false,
      false,
    );
    expect(out.thinking).toBeUndefined();
  });
});