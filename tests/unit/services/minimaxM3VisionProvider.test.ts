import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios");
vi.mock("dotenv/config", () => ({}));

const mockedAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
};

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
    await expect(async () => {
      await import("../../../src/services/minimaxM3VisionProvider");
    }).rejects.toThrow("MINIMAX_API_KEY");
    vi.unstubAllEnvs();
  });

  it("describeImage POSTs to MINIMAX_BASE_URL/v1/messages with anthropic headers", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    vi.stubEnv("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic");
    vi.stubEnv("SENSES_MODEL", "MiniMax-M3");
    const { minimaxM3VisionProvider } = await import(
      "../../../src/services/minimaxM3VisionProvider"
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
      "../../../src/services/minimaxM3VisionProvider"
    );
    await minimaxM3VisionProvider.describeImage("https://example.com/img.png");
    const callArgs = mockedAxios.post.mock.calls[0];
    const body = callArgs[1];
    expect(body.thinking).toBeUndefined();
  });

  it("returns the text content from the first text block", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
    const { minimaxM3VisionProvider } = await import(
      "../../../src/services/minimaxM3VisionProvider"
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
      "../../../src/services/minimaxM3VisionProvider"
    );
    await expect(
      minimaxM3VisionProvider.describeImage("https://example.com/img.png"),
    ).rejects.toThrow("MiniMax M3");
  });

  describe("supportsContentType", () => {
    it("returns true for image", async () => {
      vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
      const { minimaxM3VisionProvider } = await import(
        "../../../src/services/minimaxM3VisionProvider"
      );
      expect(minimaxM3VisionProvider.supportsContentType("image")).toBe(true);
    });
    it("returns true for video", async () => {
      vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
      const { minimaxM3VisionProvider } = await import(
        "../../../src/services/minimaxM3VisionProvider"
      );
      expect(minimaxM3VisionProvider.supportsContentType("video")).toBe(true);
    });
    it("returns false for audio", async () => {
      vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
      const { minimaxM3VisionProvider } = await import(
        "../../../src/services/minimaxM3VisionProvider"
      );
      expect(minimaxM3VisionProvider.supportsContentType("audio")).toBe(false);
    });
    it("name is 'minimax-m3'", async () => {
      vi.stubEnv("MINIMAX_API_KEY", "sk-test-minimax");
      const { minimaxM3VisionProvider } = await import(
        "../../../src/services/minimaxM3VisionProvider"
      );
      expect(minimaxM3VisionProvider.name).toBe("minimax-m3");
    });
  });
});
