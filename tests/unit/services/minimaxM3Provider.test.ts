import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";

vi.mock("axios");
vi.mock("dotenv/config", () => ({}));

const mockedAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
};

function parseEmittedChunks(
  onChunk: ReturnType<typeof vi.fn>,
): Record<string, unknown>[] {
  return onChunk.mock.calls
    .map((c) => {
      const m = (c[0] as string).match(/^data: (.+)\n\n$/);
      if (!m || m[1] === "[DONE]") return null;
      try {
        return JSON.parse(m[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Record<string, unknown>[];
}

describe("MiniMaxM3VisionProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: {
        content: [{ type: "text", text: "A diagram of the system" }],
        usage: { input_tokens: 100, output_tokens: 20 },
      },
    });
  });

  it("throws at constructor if MINIMAX_API_KEY is missing", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "");
    vi.stubEnv("MINIMAX_BASE_URL", "");
    vi.resetModules();
    const { MiniMaxM3VisionProvider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    expect(() => {
      new MiniMaxM3VisionProvider();
    }).toThrow("MINIMAX_API_KEY");
    vi.unstubAllEnvs();
  });

  it("describeImage POSTs to MINIMAX_BASE_URL/v1/messages with anthropic headers", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    vi.stubEnv("SENSES_MODEL", "MiniMax-M3");
    const { minimaxM3VisionProvider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    await minimaxM3VisionProvider.describeImage("https://example.com/img.png", "context");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://api.minimax.io/anthropic/v1/messages",
      expect.objectContaining({
        model: "MiniMax-M3",
        messages: [
          {
            role: "user",
            content: expect.arrayContaining([
              expect.objectContaining({ type: "text" }),
              expect.objectContaining({
                type: "image",
                source: { type: "url", url: "https://example.com/img.png" },
              }),
            ]),
          },
        ],
        max_tokens: expect.any(Number),
        stream: false,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "sk-test-minimax",
          "anthropic-version": "2023-06-01",
        }),
      }),
    );
  });

  it("does NOT include a thinking block in the payload", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    const { minimaxM3VisionProvider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    await minimaxM3VisionProvider.describeImage("https://example.com/img.png");
    const callArgs = mockedAxios.post.mock.calls[0];
    const body = callArgs[1];
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("describeVideo uses an Anthropic video block without thinking", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    const { minimaxM3VisionProvider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    await minimaxM3VisionProvider.describeVideo("https://example.com/video.mp4", "context");
    const body = mockedAxios.post.mock.calls[0][1];
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.messages[0].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "video",
          source: { type: "url", url: "https://example.com/video.mp4" },
        }),
      ]),
    );
  });
  it("returns the text content from the first text block", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    const { minimaxM3VisionProvider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    const out = await minimaxM3VisionProvider.describeImage("https://example.com/img.png");
    expect(out).toBe("A diagram of the system");
  });

  it("throws on empty response content", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    mockedAxios.post.mockResolvedValueOnce({
      data: { content: [{ type: "tool_use" }] },
    });
    const { minimaxM3VisionProvider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    await expect(
      minimaxM3VisionProvider.describeImage("https://example.com/img.png"),
    ).rejects.toThrow("MiniMax M3");
  });

  describe("supportsContentType", () => {
    it("returns true for image", async () => {
      vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
      const { minimaxM3VisionProvider } = await import(
        "../../../src/services/minimaxM3Provider"
      );
      expect(minimaxM3VisionProvider.supportsContentType("image")).toBe(true);
    });
    it("returns true for video", async () => {
      vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
      const { minimaxM3VisionProvider } = await import(
        "../../../src/services/minimaxM3Provider"
      );
      expect(minimaxM3VisionProvider.supportsContentType("video")).toBe(true);
    });
    it("returns false for audio", async () => {
      vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
      const { minimaxM3VisionProvider } = await import(
        "../../../src/services/minimaxM3Provider"
      );
      expect(minimaxM3VisionProvider.supportsContentType("audio")).toBe(false);
    });
    it("name is 'minimax-m3'", async () => {
      vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
      const { minimaxM3VisionProvider } = await import(
        "../../../src/services/minimaxM3Provider"
      );
      expect(minimaxM3VisionProvider.name).toBe("minimax-m3");
    });
  });
});

describe("MiniMaxM3Provider (passthrough chat)", () => {
  const passthroughBrainEntry = {
    upstream: "MiniMax-M3",
    context: 1_048_576,
    maxOutput: 131072,
    thinking: true,
    inputPrice: 0,
    outputPrice: 0,
    endpoint: "anthropic" as const,
  };

  beforeEach(() => {
    vi.resetModules();
    mockedAxios.post = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("createChatCompletion posts payload with thinking={type:'adaptive'} when entry.thinking=true", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    mockedAxios.post.mockResolvedValue({
      data: {
        content: [{ type: "text", text: "hello" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    });
    const { minimaxM3Provider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    await minimaxM3Provider.createChatCompletion(
      { model: "MiniMax-M3", messages: [{ role: "user" as const, content: "hi" }] },
      passthroughBrainEntry,
    );
    const body = mockedAxios.post.mock.calls[0][1];
    expect(body.thinking).toEqual({ type: "adaptive" });
  });

  it("createChatCompletion omits thinking block when entry.thinking=false (registry flag flows)", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    mockedAxios.post.mockResolvedValue({
      data: {
        content: [{ type: "text", text: "hello" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    });
    const { minimaxM3Provider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    await minimaxM3Provider.createChatCompletion(
      { model: "MiniMax-M3", messages: [{ role: "user" as const, content: "hi" }] },
      { ...passthroughBrainEntry, thinking: false },
    );
    const body = mockedAxios.post.mock.calls[0][1];
    expect(body.thinking).toBeUndefined();
  });

  it("chatCompletionStream posts payload with thinking={type:'adaptive'} when entry.thinking=true", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    const { EventEmitter } = await import("events");
    const fakeStream = new EventEmitter();
    mockedAxios.post.mockResolvedValue({ data: fakeStream });
    const { minimaxM3Provider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    const onChunk = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    await minimaxM3Provider.chatCompletionStream(
      { model: "MiniMax-M3", stream: true, messages: [{ role: "user" as const, content: "hi" }] },
      passthroughBrainEntry,
      onChunk,
      onError,
      onComplete,
    );
    const body = mockedAxios.post.mock.calls[0][1];
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.stream).toBe(true);
    fakeStream.emit("end");
  });

  it("createChatCompletion surfaces thinking blocks as message.reasoning_content", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    mockedAxios.post.mockResolvedValue({
      data: {
        content: [
          { type: "thinking", thinking: "Let me reason about 17*24." },
          { type: "thinking", thinking: " It equals 408." },
          { type: "text", text: "17 * 24 = 408" },
        ],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 25 },
      },
    });
    const { minimaxM3Provider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    const resp = await minimaxM3Provider.createChatCompletion(
      { model: "MiniMax-M3", messages: [{ role: "user" as const, content: "17*24" }] },
      passthroughBrainEntry,
    );
    const message = resp.choices[0].message;
    expect(message.reasoning_content).toBe(
      "Let me reason about 17*24.\n It equals 408.",
    );
    expect(message.content).toBe("17 * 24 = 408");
  });

  it("chatCompletionStream emits reasoning_content chunks for thinking_delta events", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    const { EventEmitter } = await import("events");
    const fakeStream = new EventEmitter();
    mockedAxios.post.mockResolvedValue({ data: fakeStream });
    const { minimaxM3Provider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    const onChunk = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    await minimaxM3Provider.chatCompletionStream(
      { model: "MiniMax-M3", stream: true, messages: [{ role: "user" as const, content: "hi" }] },
      passthroughBrainEntry,
      onChunk,
      onError,
      onComplete,
    );
    fakeStream.emit(
      "data",
      Buffer.from(
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me think."}}\n\n' +
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" 408."}}\n\n' +
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"17*24=408"}}\n\n',
      ),
    );
    // Microtask boundary: ensures all 'data' handlers have flushed their
    // onChunk calls before 'end' triggers safeEnd and the [DONE] sentinel.
    await new Promise<void>((r) => setImmediate(r));
    fakeStream.emit("end");
    const emittedBodies = parseEmittedChunks(onChunk);
    const reasoningChunks = emittedBodies.filter(
      (b) =>
        b.choices &&
        b.choices[0] &&
        (b.choices[0] as any).delta &&
        "reasoning_content" in (b.choices[0] as any).delta,
    );
    expect(reasoningChunks.length).toBeGreaterThanOrEqual(2);
    const accumulated = reasoningChunks
      .map((b) => (b.choices[0] as any).delta.reasoning_content)
      .join("");
    expect(accumulated).toBe("Let me think. 408.");
    const textChunks = emittedBodies.filter(
      (b) =>
        b.choices &&
        b.choices[0] &&
        (b.choices[0] as any).delta &&
        "content" in (b.choices[0] as any).delta,
    );
    expect(textChunks.length).toBeGreaterThanOrEqual(1);
  });

  it("chatCompletionStream skips thinking_delta with empty thinking field", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    const { EventEmitter } = await import("events");
    const fakeStream = new EventEmitter();
    mockedAxios.post.mockResolvedValue({ data: fakeStream });
    const { minimaxM3Provider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    const onChunk = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    await minimaxM3Provider.chatCompletionStream(
      { model: "MiniMax-M3", stream: true, messages: [{ role: "user" as const, content: "hi" }] },
      passthroughBrainEntry,
      onChunk,
      onError,
      onComplete,
    );
    fakeStream.emit(
      "data",
      Buffer.from(
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":""}}\n\n' +
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"ok"}}\n\n',
      ),
    );
    await new Promise<void>((r) => setImmediate(r));
    fakeStream.emit("end");
    const emittedBodies = parseEmittedChunks(onChunk);
    const reasoningChunks = emittedBodies.filter(
      (b) =>
        b.choices &&
        b.choices[0] &&
        (b.choices[0] as any).delta &&
        "reasoning_content" in (b.choices[0] as any).delta,
    );
    expect(reasoningChunks.length).toBe(0);
  });

  it("chatCompletionStream drops signature_delta (intentional, no chunk emitted)", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    const { EventEmitter } = await import("events");
    const fakeStream = new EventEmitter();
    mockedAxios.post.mockResolvedValue({ data: fakeStream });
    const { minimaxM3Provider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    const onChunk = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    await minimaxM3Provider.chatCompletionStream(
      { model: "MiniMax-M3", stream: true, messages: [{ role: "user" as const, content: "hi" }] },
      passthroughBrainEntry,
      onChunk,
      onError,
      onComplete,
    );
    fakeStream.emit(
      "data",
      Buffer.from(
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"abc123"}}\n\n' +
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"ok"}}\n\n',
      ),
    );
    await new Promise<void>((r) => setImmediate(r));
    fakeStream.emit("end");
    const emittedBodies = parseEmittedChunks(onChunk);
    const signatureChunks = emittedBodies.filter(
      (b) =>
        b.choices &&
        b.choices[0] &&
        (b.choices[0] as any).delta &&
        "signature" in (b.choices[0] as any).delta,
    );
    expect(signatureChunks.length).toBe(0);
  });

  it("chatCompletionStream uses the same chunk id across all chunks in a single response (OpenCode context continuity)", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    const { EventEmitter } = await import("events");
    const fakeStream = new EventEmitter();
    mockedAxios.post.mockResolvedValue({ data: fakeStream });
    const { minimaxM3Provider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    const onChunk = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    await minimaxM3Provider.chatCompletionStream(
      { model: "MiniMax-M3", stream: true, messages: [{ role: "user" as const, content: "hi" }] },
      passthroughBrainEntry,
      onChunk,
      onError,
      onComplete,
    );
    fakeStream.emit(
      "data",
      Buffer.from(
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n' +
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}\n\n' +
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\n' +
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":1,"output_tokens":2}}\n\n',
      ),
    );
    await new Promise<void>((r) => setImmediate(r));
    fakeStream.emit("end");
    const emitted = parseEmittedChunks(onChunk);
    expect(emitted.length).toBeGreaterThanOrEqual(3);
    const ids = new Set(emitted.map((c) => c.id));
    expect(ids.size).toBe(1);
  });

  it("chatCompletionStream emits usage chunk when message_delta carries input_tokens/output_tokens (dashboard capture)", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    const { EventEmitter } = await import("events");
    const fakeStream = new EventEmitter();
    mockedAxios.post.mockResolvedValue({ data: fakeStream });
    const { minimaxM3Provider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    const onChunk = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    await minimaxM3Provider.chatCompletionStream(
      {
        model: "MiniMax-M3",
        stream: true,
        messages: [{ role: "user" as const, content: "hi" }],
      },
      passthroughBrainEntry,
      onChunk,
      onError,
      onComplete,
    );
    fakeStream.emit(
      "data",
      Buffer.from(
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}\n\n' +
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":42,"output_tokens":7}}\n\n',
      ),
    );
    await new Promise<void>((r) => setImmediate(r));
    fakeStream.emit("end");
    const emittedBodies = parseEmittedChunks(onChunk);
    const usageChunks = emittedBodies.filter((b) => b.usage);
    expect(usageChunks).toHaveLength(1);
    const u = usageChunks[0].usage as {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    expect(u.prompt_tokens).toBe(42);
    expect(u.completion_tokens).toBe(7);
    expect(u.total_tokens).toBe(49);
  });

  it("createChatCompletion joins adjacent thinking blocks with a newline separator", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    mockedAxios.post.mockResolvedValue({
      data: {
        content: [
          { type: "thinking", thinking: "abc" },
          { type: "thinking", thinking: "xyz" },
          { type: "text", text: "answer" },
        ],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 20 },
      },
    });
    const { minimaxM3Provider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    const resp = await minimaxM3Provider.createChatCompletion(
      { model: "MiniMax-M3", messages: [{ role: "user" as const, content: "hi" }] },
      passthroughBrainEntry,
    );
    expect(resp.choices[0].message.reasoning_content).toBe("abc\nxyz");
  });

  it("chatCompletionStream skips whitespace-only thinking_delta values", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    const { EventEmitter } = await import("events");
    const fakeStream = new EventEmitter();
    mockedAxios.post.mockResolvedValue({ data: fakeStream });
    const { minimaxM3Provider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    const onChunk = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    await minimaxM3Provider.chatCompletionStream(
      { model: "MiniMax-M3", stream: true, messages: [{ role: "user" as const, content: "hi" }] },
      passthroughBrainEntry,
      onChunk,
      onError,
      onComplete,
    );
    fakeStream.emit(
      "data",
      Buffer.from(
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"   "}}\n\n' +
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"ok"}}\n\n',
      ),
    );
    await new Promise<void>((r) => setImmediate(r));
    fakeStream.emit("end");
    const reasoningChunks = parseEmittedChunks(onChunk).filter(
      (b) =>
        b.choices &&
        b.choices[0] &&
        (b.choices[0] as any).delta &&
        "reasoning_content" in (b.choices[0] as any).delta,
    );
    expect(reasoningChunks.length).toBe(0);
  });

  it("createChatCompletion skips redacted_thinking blocks (Anthropic safety-redacted reasoning)", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    mockedAxios.post.mockResolvedValue({
      data: {
        content: [
          { type: "thinking", thinking: "Visible reasoning." },
          { type: "redacted_thinking", data: "encrypted_blob" },
          { type: "text", text: "Final answer" },
        ],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 20 },
      },
    });
    const { minimaxM3Provider } = await import(
      "../../../src/services/minimaxM3Provider"
    );
    const resp = await minimaxM3Provider.createChatCompletion(
      { model: "MiniMax-M3", messages: [{ role: "user" as const, content: "hi" }] },
      passthroughBrainEntry,
    );
    const message = resp.choices[0].message;
    expect(message.reasoning_content).toBe("Visible reasoning.");
    expect(message.content).toBe("Final answer");
  });
});
