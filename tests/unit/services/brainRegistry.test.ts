import { describe, it, expect } from "vitest";
import {
  BRAIN_MODELS,
  PASSTHROUGH_MODELS,
  getBrainEntry,
  isPassthrough,
  parseProxyModelId,
  isKnownModel,
} from "../../../src/services/brainRegistry";

describe("brainRegistry", () => {
  describe("BRAIN_MODELS", () => {
    it("should contain 2 brain entries (glm-5.2, deepseek-v4-pro)", () => {
      expect(Object.keys(BRAIN_MODELS)).toHaveLength(2);
    });

    it("each entry should have required fields", () => {
      for (const [id, entry] of Object.entries(BRAIN_MODELS)) {
        expect(id).toMatch(/^proxy\//);
        expect(entry.upstream).toBeTruthy();
        expect(entry.context).toBeGreaterThan(0);
        expect(entry.maxOutput).toBeGreaterThan(0);
        expect(typeof entry.thinking).toBe("boolean");
        expect(["openai", "anthropic"]).toContain(entry.endpoint);
        expect(typeof entry.multimodal).toBe("boolean");
        expect(entry.inputPrice).toBeGreaterThanOrEqual(0);
        expect(entry.outputPrice).toBeGreaterThanOrEqual(0);
      }
    });

    it("all brains should be text-only (multimodal: false) since they use MiMo V2.5 senses", () => {
      for (const entry of Object.values(BRAIN_MODELS)) {
        expect(entry.multimodal).toBe(false);
      }
    });

    it("all brains should have thinking enabled for max-thinking policy", () => {
      for (const entry of Object.values(BRAIN_MODELS)) {
        expect(entry.thinking).toBe(true);
      }
    });

    it("should include proxy/glm-5.2 with openai endpoint", () => {
      expect(BRAIN_MODELS["proxy/glm-5.2"]).toBeDefined();
      expect(BRAIN_MODELS["proxy/glm-5.2"].upstream).toBe("glm-5.2");
      expect(BRAIN_MODELS["proxy/glm-5.2"].endpoint).toBe("openai");
    });

    it("should include proxy/deepseek-v4-pro with openai endpoint", () => {
      expect(BRAIN_MODELS["proxy/deepseek-v4-pro"]).toBeDefined();
      expect(BRAIN_MODELS["proxy/deepseek-v4-pro"].upstream).toBe("deepseek-v4-pro");
      expect(BRAIN_MODELS["proxy/deepseek-v4-pro"].endpoint).toBe("openai");
    });
  });

  describe("PASSTHROUGH_MODELS", () => {
    it("should contain 1 natively multimodal model (mimo-v2.5)", () => {
      expect(PASSTHROUGH_MODELS.size).toBe(1);
      expect(PASSTHROUGH_MODELS.has("mimo-v2.5")).toBe(true);
    });
  });

  describe("getBrainEntry", () => {
    it("should return brain entry for valid proxy model", () => {
      const entry = getBrainEntry("proxy/deepseek-v4-pro");
      expect(entry).toBeDefined();
      expect(entry!.upstream).toBe("deepseek-v4-pro");
    });

    it("should return undefined for unknown model", () => {
      expect(getBrainEntry("unknown-model")).toBeUndefined();
    });

    it("should return undefined for passthrough model", () => {
      expect(getBrainEntry("mimo-v2.5")).toBeUndefined();
    });
  });

  describe("isPassthrough", () => {
    it("should return true for natively multimodal models", () => {
      expect(isPassthrough("mimo-v2.5")).toBe(true);
    });

    it("should return false for brain models", () => {
      expect(isPassthrough("proxy/deepseek-v4-pro")).toBe(false);
    });

    it("should return false for unknown models", () => {
      expect(isPassthrough("unknown")).toBe(false);
    });
  });

  describe("parseProxyModelId", () => {
    it("should extract upstream from proxy model id", () => {
      expect(parseProxyModelId("proxy/deepseek-v4-pro")).toBe("deepseek-v4-pro");
      expect(parseProxyModelId("proxy/kimi-k2.6")).toBe("kimi-k2.6");
    });

    it("should return null for non-proxy models", () => {
      expect(parseProxyModelId("mimo-v2.5")).toBeNull();
      expect(parseProxyModelId("unknown")).toBeNull();
    });

    it("should return null for empty upstream", () => {
      expect(parseProxyModelId("proxy/")).toBeNull();
    });

    it("should be case-sensitive", () => {
      expect(parseProxyModelId("Proxy/foo")).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(parseProxyModelId("")).toBeNull();
    });
  });

  describe("isKnownModel", () => {
    it("should return true for brain models", () => {
      expect(isKnownModel("proxy/deepseek-v4-pro")).toBe(true);
    });

    it("should return true for passthrough models", () => {
      expect(isKnownModel("mimo-v2.5")).toBe(true);
    });

    it("should return false for unknown models", () => {
      expect(isKnownModel("unknown")).toBe(false);
    });
  });

  describe("isKnownModel prototype safety", () => {
    it("should return false for prototype-named IDs", () => {
      expect(isKnownModel("toString")).toBe(false);
      expect(isKnownModel("constructor")).toBe(false);
      expect(isKnownModel("hasOwnProperty")).toBe(false);
    });
  });
});