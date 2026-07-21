import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("dotenv/config", () => ({}));

vi.mock("../../../src/services/opencodeGoBrainProvider", () => ({
  opencodeGoBrainProvider: { name: "opencode-go" },
}));
vi.mock("../../../src/services/deepseekBrainProvider", () => ({
  deepseekBrainProvider: { name: "deepseek-direct" },
}));
vi.mock("../../../src/services/mimoSensesVisionProvider", () => ({
  mimoSensesVisionProvider: { name: "mimo-v2.5-senses" },
}));
vi.mock("../../../src/services/minimaxM3VisionProvider", () => ({
  minimaxM3VisionProvider: { name: "minimax-m3" },
}));

describe("providerSelector", () => {
  beforeEach(() => {
    vi.resetModules();
    const { resetBrainRegistry } = vi.importActual?.(
      "../../../src/services/brainRegistry",
    ) as any;
    resetBrainRegistry?.();
    vi.unstubAllEnvs();
  });

  describe("resolveMode", () => {
    it("returns 'opencode' by default when BRAIN_MODE unset and OPENCODE_GO_API_KEY set", async () => {
      vi.stubEnv("BRAIN_MODE", "");
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-opencode");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      const { resolveMode } = await import(
        "../../../src/services/providerSelector"
      );
      expect(resolveMode()).toBe("opencode");
    });

    it("returns 'deepseek' when BRAIN_MODE=deepseek and DEEPSEEK_API_KEY set", async () => {
      vi.stubEnv("BRAIN_MODE", "deepseek");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-deepseek");
      const { resolveMode } = await import(
        "../../../src/services/providerSelector"
      );
      expect(resolveMode()).toBe("deepseek");
    });

    it("returns 'hybrid' when BRAIN_MODE=hybrid with both keys", async () => {
      vi.stubEnv("BRAIN_MODE", "hybrid");
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-opencode");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-deepseek");
      const { resolveMode } = await import(
        "../../../src/services/providerSelector"
      );
      expect(resolveMode()).toBe("hybrid");
    });

    it("auto mode picks deepseek when DEEPSEEK_API_KEY present", async () => {
      vi.stubEnv("BRAIN_MODE", "");
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-opencode");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-deepseek");
      const { resolveMode } = await import(
        "../../../src/services/providerSelector"
      );
      expect(resolveMode()).toBe("deepseek");
    });

    it("auto mode picks opencode when only OPENCODE_GO_API_KEY present", async () => {
      vi.stubEnv("BRAIN_MODE", "");
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-opencode");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      const { resolveMode } = await import(
        "../../../src/services/providerSelector"
      );
      expect(resolveMode()).toBe("opencode");
    });

    it("throws at startup when no brain key is set", async () => {
      vi.stubEnv("BRAIN_MODE", "");
      vi.stubEnv("OPENCODE_GO_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      await expect(async () => {
        await import("../../../src/services/providerSelector");
      }).rejects.toThrow(/OPENCODE_GO_API_KEY|DEEPSEEK_API_KEY|brain/);
    });

    it("throws when BRAIN_MODE=opencode but OPENCODE_GO_API_KEY missing", async () => {
      vi.stubEnv("BRAIN_MODE", "opencode");
      vi.stubEnv("OPENCODE_GO_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-d");
      await expect(async () => {
        await import("../../../src/services/providerSelector");
      }).rejects.toThrow(/OPENCODE_GO_API_KEY/);
    });

    it("throws when BRAIN_MODE=deepseek but DEEPSEEK_API_KEY missing", async () => {
      vi.stubEnv("BRAIN_MODE", "deepseek");
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-o");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      await expect(async () => {
        await import("../../../src/services/providerSelector");
      }).rejects.toThrow(/DEEPSEEK_API_KEY/);
    });
  });

  describe("getActiveBrainProvider / getActiveVisionProvider", () => {
    it("opencode mode resolves to OpenCodeGoBrainProvider + MimoSensesVisionProvider", async () => {
      vi.stubEnv("BRAIN_MODE", "opencode");
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-o");
      const { getActiveBrainProvider, getActiveVisionProvider } = await import(
        "../../../src/services/providerSelector"
      );
      expect(getActiveBrainProvider().name).toBe("opencode-go");
      expect(getActiveVisionProvider().name).toBe("mimo-v2.5-senses");
    });

    it("deepseek mode + MINIMAX_API_KEY resolves to DeepSeekBrainProvider + MiniMaxM3VisionProvider", async () => {
      vi.stubEnv("BRAIN_MODE", "deepseek");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-d");
      vi.stubEnv("MINIMAX_API_KEY", "sk-m");
      const { getActiveBrainProvider, getActiveVisionProvider, getActiveBrainModels } =
        await import("../../../src/services/providerSelector");
      expect(getActiveBrainProvider().name).toBe("deepseek-direct");
      expect(getActiveVisionProvider().name).toBe("minimax-m3");
      const ids = Object.keys(getActiveBrainModels());
      expect(ids).toContain("proxy/deepseek-v4-pro");
      expect(ids).toContain("proxy/deepseek-v4-flash");
      expect(ids).not.toContain("proxy/glm-5.2");
    });

    it("deepseek mode without MINIMAX_API_KEY resolves vision to null with warning", async () => {
      vi.stubEnv("BRAIN_MODE", "deepseek");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-d");
      vi.stubEnv("MINIMAX_API_KEY", "");
      const { getActiveVisionProvider } = await import(
        "../../../src/services/providerSelector"
      );
      expect(getActiveVisionProvider()).toBeNull();
    });

    it("hybrid mode registers both flavors of DeepSeek brains", async () => {
      vi.stubEnv("BRAIN_MODE", "hybrid");
      vi.stubEnv("OPENCODE_GO_API_KEY", "sk-o");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-d");
      vi.stubEnv("MINIMAX_API_KEY", "sk-m");
      const { getActiveBrainModels } = await import(
        "../../../src/services/providerSelector"
      );
      const ids = Object.keys(getActiveBrainModels());
      expect(ids).toContain("proxy/deepseek-v4-pro");
      expect(ids).toContain("proxy/local-deepseek-v4-pro");
      expect(ids).toContain("proxy/glm-5.2");
    });
  });
});