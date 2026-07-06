import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios");
vi.mock("dotenv/config", () => ({}));

describe("OpenCodeGoService", () => {
  beforeEach(() => {
    vi.resetModules();
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
        model: "proxy/deepseek-v4-flash",
        messages: [{ role: "user" as const, content: "hello" }],
        stream: false,
      };

      const payload = opencodeGoService.buildPayload(
        request,
        "deepseek-v4-flash",
        true,
      );
      expect(payload.model).toBe("deepseek-v4-flash");
      expect(payload.messages).toHaveLength(1);
      expect(payload.stream).toBe(false);
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
});