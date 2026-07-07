import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassThrough, Readable } from "node:stream";
import axios from "axios";

vi.mock("axios");
vi.mock("dotenv/config", () => ({}));

const mockedAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
};

describe("OpenCodeGoService", () => {
  beforeEach(() => {
    vi.resetModules();
    mockedAxios.post = vi.fn();
  });

  describe("constructor", () => {
    it("should throw if OPENCODE_GO_API_KEY is not set", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "");
      await expect(async () => {
        await import("../../../src/services/opencodeGoService");
      }).rejects.toThrow("OPENCODE_GO_API_KEY");
      vi.unstubAllEnvs();
    });
  });

  describe("buildPayload", () => {
    it("should build openai payload for openai endpoint brain", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import(
        "../../../src/services/opencodeGoService"
      );

      const request = {
        model: "proxy/deepseek-v4-pro",
        messages: [{ role: "user" as const, content: "hello" }],
        stream: false,
      };

      const payload = opencodeGoService.buildPayload(
        request,
        "deepseek-v4-pro",
        true,
        1048576,
        "openai",
      );
      expect(payload.model).toBe("deepseek-v4-pro");
      expect(payload.thinking).toEqual({ type: "enabled" });
      expect(payload.messages).toHaveLength(1);
      expect(payload.stream).toBe(false);
      vi.unstubAllEnvs();
    });

    it("should translate payload to Anthropic format when endpoint is anthropic", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import(
        "../../../src/services/opencodeGoService"
      );

      const request = {
        model: "proxy/glm-5.2",
        messages: [
          { role: "system" as const, content: "You are helpful." },
          { role: "user" as const, content: "hello" },
        ],
        stream: false,
      };

      const payload = opencodeGoService.buildPayload(
        request,
        "glm-5.2",
        true,
        1048576,
        "anthropic",
      );
      expect(payload.model).toBe("glm-5.2");
      expect(payload.system).toBe("You are helpful.");
      expect(payload.messages).toHaveLength(1);
      expect(payload.messages[0].role).toBe("user");
      expect(payload.max_tokens).toBeGreaterThan(0);
      vi.unstubAllEnvs();
    });

    it("should convert OpenAI tools to Anthropic tools", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import(
        "../../../src/services/opencodeGoService"
      );

      const request = {
        model: "proxy/glm-5.2",
        messages: [{ role: "user" as const, content: "hello" }],
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get weather",
              parameters: { type: "object", properties: { city: { type: "string" } } },
            },
          },
        ],
        stream: false,
      };

      const payload = opencodeGoService.buildPayload(
        request,
        "glm-5.2",
        false,
        1048576,
        "anthropic",
      );
      expect(payload.tools).toHaveLength(1);
      expect(payload.tools[0].name).toBe("get_weather");
      expect(payload.tools[0].input_schema).toBeDefined();
      vi.unstubAllEnvs();
    });

    it("should convert tool_calls in assistant messages to Anthropic tool_use blocks", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import(
        "../../../src/services/opencodeGoService"
      );

      const request = {
        model: "proxy/glm-5.2",
        messages: [
          {
            role: "assistant" as const,
            content: "",
            tool_calls: [
              {
                id: "call_123",
                type: "function",
                function: { name: "get_weather", arguments: JSON.stringify({ city: "Madrid" }) },
              },
            ],
          },
        ],
        stream: false,
      };

      const payload = opencodeGoService.buildPayload(
        request,
        "glm-5.2",
        false,
        1048576,
        "anthropic",
      );
      const assistantMsg = payload.messages[0];
      const toolUse = assistantMsg.content.find((b: any) => b.type === "tool_use");
      expect(toolUse).toBeDefined();
      expect(toolUse.id).toBe("call_123");
      expect(toolUse.name).toBe("get_weather");
      expect(toolUse.input).toEqual({ city: "Madrid" });
      vi.unstubAllEnvs();
    });

    it("should respect maxContextTokens parameter and truncate overflow", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import(
        "../../../src/services/opencodeGoService"
      );

      const longContent = "x".repeat(6000);
      const messages = [
        { role: "user" as const, content: longContent },
      ];

      const request = {
        model: "proxy/glm-5.2",
        messages,
        stream: false,
      };

      const payload = opencodeGoService.buildPayload(
        request,
        "glm-5.2",
        true,
        1000,
        "openai",
      );

      expect(payload.messages.length).toBeLessThan(messages.length);
      vi.unstubAllEnvs();
    });
  });

  describe("resolveEndpointUrl", () => {
    it("should return openai endpoint for openai brain", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import(
        "../../../src/services/opencodeGoService"
      );

      const url = opencodeGoService.resolveEndpointUrl("openai");
      expect(url).toContain("/chat/completions");
      expect(url).toContain("opencode.ai");
      vi.unstubAllEnvs();
    });

    it("should return anthropic endpoint for anthropic brain", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import(
        "../../../src/services/opencodeGoService"
      );

      const url = opencodeGoService.resolveEndpointUrl("anthropic");
      expect(url).toContain("/messages");
      expect(url).toContain("opencode.ai");
      vi.unstubAllEnvs();
    });
  });

  describe("createChatCompletion auth header", () => {
    it("should send Bearer auth header", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import(
        "../../../src/services/opencodeGoService"
      );

      mockedAxios.post.mockResolvedValueOnce({
        data: {
          id: "x",
          object: "chat.completion",
          created: 1,
          model: "glm-5.2",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "hi" },
              finish_reason: "stop",
            },
          ],
        },
      });

      await opencodeGoService.createChatCompletion(
        {
          model: "proxy/kimi-k2.7-code",
          messages: [{ role: "user", content: "hi" }],
          stream: false,
        },
        {
          upstream: "glm-5.2",
          context: 262144,
          maxOutput: 262144,
          thinking: false,
          inputPrice: 0,
          outputPrice: 0,
          endpoint: "openai",
        },
      );

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const call = mockedAxios.post.mock.calls[0];
      const headers = call[2]?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer sk-test-key");
      vi.unstubAllEnvs();
    });

    it("should send x-api-key header and anthropic-version for Anthropic endpoint", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import(
        "../../../src/services/opencodeGoService"
      );

      mockedAxios.post.mockResolvedValueOnce({
        data: {
          id: "x",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "hi" }],
          model: "glm-5.2",
          stop_reason: "end_turn",
        },
      });

      await opencodeGoService.createChatCompletion(
        {
          model: "proxy/qwen3.6-plus",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 30,
          stream: false,
        },
        {
          upstream: "glm-5.2",
          context: 1048576,
          maxOutput: 65536,
          thinking: false,
          inputPrice: 0,
          outputPrice: 0,
          endpoint: "anthropic",
        },
      );

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const call = mockedAxios.post.mock.calls[0];
      const headers = call[2]?.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("sk-test-key");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
      expect(headers.Authorization).toBeUndefined();
      vi.unstubAllEnvs();
    });
  });

  describe("chatCompletionStream", () => {
    it("should buffer SSE chunks split across the packet boundary", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import(
        "../../../src/services/opencodeGoService"
      );

      const eventPayload = JSON.stringify({
        id: "x",
        object: "chat.completion.chunk",
        created: 1,
        model: "glm-5.2",
        choices: [
          { index: 0, delta: { content: "hi" }, finish_reason: null },
        ],
      });

      const stream = Readable.from([
        Buffer.from(`data: ${eventPayload.slice(0, 40)}`),
        Buffer.from(`${eventPayload.slice(40)}\n\n`),
        Buffer.from("data: [DONE]\n\n"),
      ]);

      mockedAxios.post.mockResolvedValueOnce({ data: stream });

      const chunks: string[] = [];
      const errors: unknown[] = [];
      let completed = false;
      let safeEndGuard = true;

      await opencodeGoService.chatCompletionStream(
        {
          model: "proxy/kimi-k2.7-code",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        },
        {
          upstream: "glm-5.2",
          context: 262144,
          maxOutput: 262144,
          thinking: false,
          inputPrice: 0,
          outputPrice: 0,
          endpoint: "openai",
        },
        (chunk) => chunks.push(chunk),
        (error) => errors.push(error),
        () => {
          if (!safeEndGuard) return;
          safeEndGuard = false;
          completed = true;
        },
      );

      await new Promise((resolve) => setImmediate(resolve));

      expect(errors).toHaveLength(0);
      expect(completed).toBe(true);
      const reconstructed = chunks.join("");
      expect(reconstructed).toContain(eventPayload);
      expect(reconstructed).not.toContain("[DONE]");
      vi.unstubAllEnvs();
    });

    it("should send Bearer auth header on stream requests", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import(
        "../../../src/services/opencodeGoService"
      );

      const stream = Readable.from([]);
      mockedAxios.post.mockResolvedValueOnce({ data: stream });

      await opencodeGoService.chatCompletionStream(
        {
          model: "proxy/kimi-k2.7-code",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        },
        {
          upstream: "glm-5.2",
          context: 262144,
          maxOutput: 262144,
          thinking: false,
          inputPrice: 0,
          outputPrice: 0,
          endpoint: "openai",
        },
        () => {},
        () => {},
        () => {},
      );

      const call = mockedAxios.post.mock.calls[0];
      const headers = call[2]?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer sk-test-key");
      expect(call[2]?.responseType).toBe("stream");
      vi.unstubAllEnvs();
    });

    it("should not call onError after clean 'end' (socket reset race)", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import(
        "../../../src/services/opencodeGoService"
      );

      const stream = new PassThrough();
      mockedAxios.post.mockResolvedValueOnce({ data: stream });

      const chunks: string[] = [];
      const errors: unknown[] = [];
      let completeCount = 0;

      const promise = opencodeGoService.chatCompletionStream(
        {
          model: "proxy/kimi-k2.7-code",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        },
        {
          upstream: "glm-5.2",
          context: 262144,
          maxOutput: 262144,
          thinking: false,
          inputPrice: 0,
          outputPrice: 0,
          endpoint: "openai",
        },
        (chunk) => chunks.push(chunk),
        (error) => errors.push(error),
        () => {
          completeCount += 1;
        },
      );

      stream.write('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n');
      stream.end();
      await new Promise((resolve) => setImmediate(resolve));
      stream.destroy(new Error("socket hang up after end"));

      await expect(promise).resolves.toBeUndefined();
      await new Promise((resolve) => setImmediate(resolve));

      expect(completeCount).toBe(1);
      expect(errors).toHaveLength(0);
      vi.unstubAllEnvs();
    });

    it("should not throw and should call onError exactly once when upstream stream errors before end", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import(
        "../../../src/services/opencodeGoService"
      );

      const stream = new PassThrough();
      mockedAxios.post.mockResolvedValueOnce({ data: stream });

      const chunks: string[] = [];
      const errors: unknown[] = [];
      let completeCount = 0;

      const promise = opencodeGoService.chatCompletionStream(
        {
          model: "proxy/kimi-k2.7-code",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        },
        {
          upstream: "glm-5.2",
          context: 262144,
          maxOutput: 262144,
          thinking: false,
          inputPrice: 0,
          outputPrice: 0,
          endpoint: "openai",
        },
        (chunk) => chunks.push(chunk),
        (error) => errors.push(error),
        () => {
          completeCount += 1;
        },
      );

      stream.write('data: {"choices":[{"delta":{"content":"hel"}}]}\n\n');
      stream.destroy(new Error("upstream closed connection"));

      await expect(promise).resolves.toBeUndefined();
      await new Promise((resolve) => setImmediate(resolve));

      expect(errors.length).toBe(1);
      expect(completeCount).toBe(0);
      vi.unstubAllEnvs();
    });

    it("should flush pending buffer exactly once on 'end' even if 'data' and 'end' race", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { opencodeGoService } = await import(
        "../../../src/services/opencodeGoService"
      );

      const stream = new PassThrough();
      mockedAxios.post.mockResolvedValueOnce({ data: stream });

      const chunks: string[] = [];
      const errors: unknown[] = [];
      let completeCount = 0;

      const promise = opencodeGoService.chatCompletionStream(
        {
          model: "proxy/kimi-k2.7-code",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        },
        {
          upstream: "glm-5.2",
          context: 262144,
          maxOutput: 262144,
          thinking: false,
          inputPrice: 0,
          outputPrice: 0,
          endpoint: "openai",
        },
        (chunk) => chunks.push(chunk),
        (error) => errors.push(error),
        () => {
          completeCount += 1;
        },
      );

      stream.write('data: {"choices":[{"delta":{"content":"final"}}]}');
      stream.end();

      await expect(promise).resolves.toBeUndefined();
      await new Promise((resolve) => setImmediate(resolve));

      expect(errors).toHaveLength(0);
      expect(completeCount).toBe(1);
      const reconstructed = chunks.join("");
      expect(reconstructed).toContain('"content":"final"');
      vi.unstubAllEnvs();
    });
  });
});
