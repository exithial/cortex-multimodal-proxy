import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios");
vi.mock("dotenv/config", () => ({}));

describe("MiMoSensesService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("isAvailable", () => {
    it("should return true when OPENCODE_GO_API_KEY is set", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-test-key");
      const { mimoSensesService } = await import("../../../src/services/mimoSensesService");
      expect(mimoSensesService.isAvailable()).toBe(true);
      vi.unstubAllEnvs();
    });

    it("should return false when OPENCODE_GO_API_KEY is not set", async () => {
      vi.stubEnv("OPENCODE_GO_API_KEY", "");
      const { mimoSensesService } = await import("../../../src/services/mimoSensesService");
      expect(mimoSensesService.isAvailable()).toBe(false);
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

      const { mimoSensesService } = await import("../../../src/services/mimoSensesService");

      const result = await mimoSensesService.describeImage(
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
