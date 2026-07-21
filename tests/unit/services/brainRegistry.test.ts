import { describe, it, expect } from "vitest";
import {
  BRAIN_MODELS_BASE,
  resetBrainRegistry,
  PASSTHROUGH_MODELS,
  getBrainEntry,
  isPassthrough,
  parseProxyModelId,
  isKnownModel,
} from "../../../src/services/brainRegistry";
import { truncateMessages } from "../../../src/services/messageTransforms";

beforeEach(() => {
  resetBrainRegistry();
});

describe("brainRegistry", () => {
  describe("BRAIN_MODELS_BASE", () => {
    it("should contain 4 brain entries (glm-5.2, deepseek-v4-pro, qwen3.7-max, mimo-v2.5-pro)", () => {
      expect(Object.keys(BRAIN_MODELS_BASE)).toHaveLength(4);
    });

    it("each entry should have required fields", () => {
      for (const [id, entry] of Object.entries(BRAIN_MODELS_BASE)) {
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
      for (const entry of Object.values(BRAIN_MODELS_BASE)) {
        expect(entry.multimodal).toBe(false);
      }
    });

    it("all brains should have thinking enabled for max-thinking policy", () => {
      for (const entry of Object.values(BRAIN_MODELS_BASE)) {
        expect(entry.thinking).toBe(true);
      }
    });

    it("should include proxy/glm-5.2 with openai endpoint and 1M context", () => {
      expect(BRAIN_MODELS_BASE["proxy/glm-5.2"]).toBeDefined();
      expect(BRAIN_MODELS_BASE["proxy/glm-5.2"].upstream).toBe("glm-5.2");
      expect(BRAIN_MODELS_BASE["proxy/glm-5.2"].endpoint).toBe("openai");
      expect(BRAIN_MODELS_BASE["proxy/glm-5.2"].context).toBe(1_048_576);
    });

    it("should include proxy/deepseek-v4-pro with openai endpoint and 1M context", () => {
      expect(BRAIN_MODELS_BASE["proxy/deepseek-v4-pro"]).toBeDefined();
      expect(BRAIN_MODELS_BASE["proxy/deepseek-v4-pro"].upstream).toBe("deepseek-v4-pro");
      expect(BRAIN_MODELS_BASE["proxy/deepseek-v4-pro"].endpoint).toBe("openai");
      expect(BRAIN_MODELS_BASE["proxy/deepseek-v4-pro"].context).toBe(1_048_576);
    });

    it("should include proxy/qwen3.7-max with anthropic endpoint and 1M context", () => {
      const entry = BRAIN_MODELS_BASE["proxy/qwen3.7-max"];
      expect(entry).toBeDefined();
      expect(entry.upstream).toBe("qwen3.7-max");
      expect(entry.endpoint).toBe("anthropic");
      expect(entry.context).toBe(1_048_576);
      expect(entry.maxOutput).toBe(65_536);
      expect(entry.thinking).toBe(true);
      expect(entry.multimodal).toBe(false);
      expect(entry.inputPrice).toBe(2.50);
      expect(entry.outputPrice).toBe(7.50);
    });

    it("should include proxy/mimo-v2.5-pro with openai endpoint and 1M context", () => {
      const entry = BRAIN_MODELS_BASE["proxy/mimo-v2.5-pro"];
      expect(entry).toBeDefined();
      expect(entry.upstream).toBe("mimo-v2.5-pro");
      expect(entry.endpoint).toBe("openai");
      expect(entry.context).toBe(1_048_576);
      expect(entry.maxOutput).toBe(65_536);
      expect(entry.thinking).toBe(true);
      expect(entry.multimodal).toBe(false);
      expect(entry.inputPrice).toBe(1.74);
      expect(entry.outputPrice).toBe(3.48);
    });
  });

  describe("PASSTHROUGH_MODELS", () => {
    it("should contain 2 natively multimodal models (mimo-v2.5, MiniMax-M3)", () => {
      expect(PASSTHROUGH_MODELS.size).toBe(2);
      expect(PASSTHROUGH_MODELS.has("mimo-v2.5")).toBe(true);
      expect(PASSTHROUGH_MODELS.has("MiniMax-M3")).toBe(true);
    });
  });

  describe("getBrainEntry", () => {
    it("should return brain entry for valid proxy model", () => {
      const entry = getBrainEntry("proxy/deepseek-v4-pro");
      expect(entry).toBeDefined();
      expect(entry!.upstream).toBe("deepseek-v4-pro");
    });

    it("should return brain entry for proxy/qwen3.7-max", () => {
      const entry = getBrainEntry("proxy/qwen3.7-max");
      expect(entry).toBeDefined();
      expect(entry!.upstream).toBe("qwen3.7-max");
      expect(entry!.endpoint).toBe("anthropic");
    });

    it("should return brain entry for proxy/mimo-v2.5-pro", () => {
      const entry = getBrainEntry("proxy/mimo-v2.5-pro");
      expect(entry).toBeDefined();
      expect(entry!.upstream).toBe("mimo-v2.5-pro");
      expect(entry!.endpoint).toBe("openai");
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

    it("should return false for proxy/mimo-v2.5-pro (it's a brain, not passthrough)", () => {
      expect(isPassthrough("proxy/mimo-v2.5-pro")).toBe(false);
    });

    it("should return false for unknown models", () => {
      expect(isPassthrough("unknown")).toBe(false);
    });
  });

  describe("parseProxyModelId", () => {
    it("should extract upstream from proxy model id", () => {
      expect(parseProxyModelId("proxy/deepseek-v4-pro")).toBe("deepseek-v4-pro");
      expect(parseProxyModelId("proxy/kimi-k2.6")).toBe("kimi-k2.6");
      expect(parseProxyModelId("proxy/qwen3.7-max")).toBe("qwen3.7-max");
      expect(parseProxyModelId("proxy/mimo-v2.5-pro")).toBe("mimo-v2.5-pro");
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
      expect(isKnownModel("proxy/qwen3.7-max")).toBe(true);
      expect(isKnownModel("proxy/mimo-v2.5-pro")).toBe(true);
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

  describe("truncateMessages respects each brain's full upstream context", () => {
    // Regression guard: ensure the 2026-07-14 bump to 1_048_576 for the
    // originally-800K brains (glm-5.2, deepseek-v4-pro) is preserved and that
    // truncateMessages does not artificially cap the proxy's output below the
    // real upstream limit. See CLAUDE.md § Brain context window policy.

    const upstreamAccepts1M = [
      "proxy/glm-5.2",
      "proxy/deepseek-v4-pro",
      "proxy/qwen3.7-max",
      "proxy/mimo-v2.5-pro",
    ];

    it.each(upstreamAccepts1M)(
      "%s registry context is exactly 1_048_576 (1M upstream)",
      (modelId) => {
        const entry = BRAIN_MODELS_BASE[modelId];
        expect(entry).toBeDefined();
        expect(entry.context).toBe(1_048_576);
      },
    );

    it("truncateMessages preserves a ~900K-token user message when context=1_048_576", () => {
      // Generate a single user message whose estimated token count exceeds 800K
      // (the legacy limit) but fits within 1M. truncateMessages must keep it.
      const tokenEstimate = 900_000;
      const charsPerToken = 3;
      const bigContent = "x".repeat(tokenEstimate * charsPerToken);

      const result = truncateMessages(
        [{ role: "user", content: bigContent }],
        1_048_576,
      );

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(bigContent);
    });

    it("truncateMessages still drops a >1M-token user message down to fit", () => {
      // Sanity check: at the new 1M limit, a 1.2M-token message should be
      // truncated (not the full message).
      const bigContent = "y".repeat(1_200_000 * 3);

      const result = truncateMessages(
        [{ role: "user", content: bigContent }],
        1_048_576,
      );

      // The single user message should be dropped entirely (its token count
      // exceeds the available budget) OR kept but truncated; either way the
      // returned content length must be less than the input.
      const totalChars = result.reduce(
        (acc, m) =>
          acc +
          (typeof m.content === "string"
            ? m.content.length
            : JSON.stringify(m.content).length),
        0,
      );
      expect(totalChars).toBeLessThan(bigContent.length);
    });
  });
});

describe("BrainRegistry runtime registration", () => {
  beforeEach(async () => {
    const { resetBrainRegistry } = await import(
      "../../../src/services/brainRegistry"
    );
    resetBrainRegistry();
  });

  it("registerBrainEntry adds an entry visible via getBrainModels and getBrainEntry", async () => {
    const { registerBrainEntry, getBrainModels, getBrainEntry } =
      await import("../../../src/services/brainRegistry");
    registerBrainEntry("proxy/local-test", {
      upstream: "deepseek-v4-pro",
      context: 1_048_576,
      maxOutput: 384_000,
      thinking: true,
      inputPrice: 0.435,
      outputPrice: 0.87,
      endpoint: "openai",
      multimodal: false,
    });
    expect(getBrainModels()["proxy/local-test"]).toBeDefined();
    expect(getBrainEntry("proxy/local-test")?.upstream).toBe("deepseek-v4-pro");
  });

  it("parseLocalProxyModelId strips 'proxy/local-' prefix", async () => {
    const { parseLocalProxyModelId } = await import(
      "../../../src/services/brainRegistry"
    );
    expect(parseLocalProxyModelId("proxy/local-deepseek-v4-pro")).toBe(
      "deepseek-v4-pro",
    );
    expect(parseLocalProxyModelId("proxy/local-deepseek-v4-flash")).toBe(
      "deepseek-v4-flash",
    );
    expect(parseLocalProxyModelId("proxy/deepseek-v4-pro")).toBeNull();
    expect(parseLocalProxyModelId("not-a-proxy-id")).toBeNull();
  });

  it("isKnownModel sees registered entries", async () => {
    const { registerBrainEntry, isKnownModel } = await import(
      "../../../src/services/brainRegistry"
    );
    registerBrainEntry("proxy/local-test", {
      upstream: "deepseek-v4-pro",
      context: 1_048_576,
      maxOutput: 384_000,
      thinking: true,
      inputPrice: 0.435,
      outputPrice: 0.87,
      endpoint: "openai",
      multimodal: false,
    });
    expect(isKnownModel("proxy/local-test")).toBe(true);
  });
});