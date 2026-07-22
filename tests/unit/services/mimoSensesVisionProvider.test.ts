import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios");
vi.mock("dotenv/config", () => ({}));

describe("MiMoSensesVisionProvider", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("describeVideo", () => {
    it("throws not supported", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { mimoSensesVisionProvider } = await import("../../../src/services/mimoSensesVisionProvider");
      await expect(mimoSensesVisionProvider.describeVideo("https://example.com/video.mp4")).rejects.toThrow("not supported");
      vi.unstubAllEnvs();
    });
  });
  describe("isAvailable", () => {
    it("should return true when OPENCODE_GO_API_KEY is set", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { mimoSensesVisionProvider } = await import("../../../src/services/mimoSensesVisionProvider");
      expect(mimoSensesVisionProvider.isAvailable()).toBe(true);
      vi.unstubAllEnvs();
    });

    it("should return false when OPENCODE_GO_API_KEY is not set", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "");
      const { mimoSensesVisionProvider } = await import("../../../src/services/mimoSensesVisionProvider");
      expect(mimoSensesVisionProvider.isAvailable()).toBe(false);
      vi.unstubAllEnvs();
    });
  });

  describe("describeImage", () => {
    it("should call OpenCode Go /chat/completions with image content", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const axios = await import("axios");
      const postSpy = vi.spyOn(axios.default, "post").mockResolvedValue({
        data: {
          choices: [
            { message: { content: "A screenshot of a VS Code editor" } },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        },
      });

      const { mimoSensesVisionProvider } = await import("../../../src/services/mimoSensesVisionProvider");

      const result = await mimoSensesVisionProvider.describeImage(
        "data:image/png;base64,abc123",
        "describe this screenshot",
      );

      expect(result).toBe("A screenshot of a VS Code editor");
      expect(postSpy).toHaveBeenCalledOnce();
      const [url, body, config] = postSpy.mock.calls[0];
      expect(url).toContain("opencode.ai/zen/go/v1/chat/completions");
      expect(body.model).toBe("mimo-v2.5");
      expect(config.headers.Authorization).toBe("Bearer sk-test-key");

      vi.unstubAllEnvs();
    });
  });
});

import { mimoSensesVisionProvider } from "../../../src/services/mimoSensesVisionProvider";

describe("MimoSensesVisionProvider.supportsContentType", () => {
  it("returns true for image", () => {
    expect(mimoSensesVisionProvider.supportsContentType("image")).toBe(true);
  });
  it("returns false for video", () => {
    expect(mimoSensesVisionProvider.supportsContentType("video")).toBe(false);
  });
  it("returns false for audio", () => {
    expect(mimoSensesVisionProvider.supportsContentType("audio")).toBe(false);
  });
});
