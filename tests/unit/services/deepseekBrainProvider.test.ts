import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios");
vi.mock("dotenv/config", () => ({}));

const mockedAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
};

const openaiBrainEntry = {
  upstream: "deepseek-v4-pro",
  context: 1_048_576,
  maxOutput: 384_000,
  thinking: true,
  inputPrice: 0.435,
  outputPrice: 0.87,
  endpoint: "openai" as const,
  multimodal: false,
};

describe("DeepSeekBrainProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    mockedAxios.post = vi.fn();
  });

  it("throws at constructor if DEEPSEEK_API_KEY is missing", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("DEEPSEEK_BASE_URL", "");
    await expect(async () => {
      await import("../../../src/services/deepseekBrainProvider");
    }).rejects.toThrow("DEEPSEEK_API_KEY");
    vi.unstubAllEnvs();
  });

  it("buildPayload sets thinking block when entry.thinking=true", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
    const { deepseekBrainProvider } = await import(
      "../../../src/services/deepseekBrainProvider"
    );
    const payload = deepseekBrainProvider.buildPayload(
      { model: "x", messages: [{ role: "user" as const, content: "hi" }] },
      "deepseek-v4-pro",
      true,
      1_048_576,
      "openai",
    );
    expect(payload.model).toBe("deepseek-v4-pro");
    expect(payload.thinking).toEqual({ type: "enabled" });
  });

  it("buildPayload omits thinking when entry.thinking=false", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
    const { deepseekBrainProvider } = await import(
      "../../../src/services/deepseekBrainProvider"
    );
    const payload = deepseekBrainProvider.buildPayload(
      { model: "x", messages: [{ role: "user" as const, content: "hi" }] },
      "deepseek-v4-pro",
      false,
      1_048_576,
      "openai",
    );
    expect(payload.thinking).toBeUndefined();
  });

  it("createChatCompletion POSTs to DEEPSEEK_BASE_URL/chat/completions with Bearer auth", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com");
    mockedAxios.post.mockResolvedValue({ data: { choices: [] } });
    const { deepseekBrainProvider } = await import(
      "../../../src/services/deepseekBrainProvider"
    );
    await deepseekBrainProvider.createChatCompletion(
      { model: "proxy/deepseek-v4-pro", messages: [{ role: "user" as const, content: "hi" }] },
      openaiBrainEntry,
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({ model: "deepseek-v4-pro", thinking: { type: "enabled" } }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-deepseek",
        }),
        timeout: expect.any(Number),
      }),
    );
  });

  it("retries on 503 and succeeds on second attempt", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
    mockedAxios.post
      .mockRejectedValueOnce({ response: { status: 503, headers: {} }, isAxiosError: true })
      .mockResolvedValueOnce({ data: { choices: [] } });
    const { deepseekBrainProvider } = await import(
      "../../../src/services/deepseekBrainProvider"
    );
    const resp = await deepseekBrainProvider.createChatCompletion(
      { model: "x", messages: [{ role: "user" as const, content: "hi" }] },
      openaiBrainEntry,
    );
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(resp).toEqual({ choices: [] });
  });

  it("throws on non-retryable 400", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
    mockedAxios.post.mockRejectedValue({
      response: { status: 400, headers: {} },
      isAxiosError: true,
    });
    const { deepseekBrainProvider } = await import(
      "../../../src/services/deepseekBrainProvider"
    );
    await expect(
      deepseekBrainProvider.createChatCompletion(
        { model: "x", messages: [{ role: "user" as const, content: "hi" }] },
        openaiBrainEntry,
      ),
    ).rejects.toBeDefined();
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it("name is 'deepseek-direct'", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
    const { deepseekBrainProvider } = await import(
      "../../../src/services/deepseekBrainProvider"
    );
    expect(deepseekBrainProvider.name).toBe("deepseek-direct");
  });
});