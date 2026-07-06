export interface BrainModelEntry {
  upstream: string;
  context: number;
  maxOutput: number;
  thinking: boolean;
  inputPrice: number;
  outputPrice: number;
  endpoint: "openai" | "anthropic";
}

export const BRAIN_MODELS: Record<string, BrainModelEntry> = {
  "proxy/kimi-k2.7-code": {
    upstream: "kimi-k2.7-code",
    context: 262144,
    maxOutput: 262144,
    thinking: false,
    inputPrice: 0.95,
    outputPrice: 4.0,
    endpoint: "openai",
  },
  "proxy/kimi-k2.6": {
    upstream: "kimi-k2.6",
    context: 262144,
    maxOutput: 65536,
    thinking: false,
    inputPrice: 0.95,
    outputPrice: 4.0,
    endpoint: "openai",
  },
  "proxy/glm-5.2": {
    upstream: "glm-5.2",
    context: 1048576,
    maxOutput: 131072,
    thinking: true,
    inputPrice: 1.4,
    outputPrice: 4.4,
    endpoint: "openai",
  },
  "proxy/glm-5.1": {
    upstream: "glm-5.1",
    context: 202752,
    maxOutput: 32768,
    thinking: true,
    inputPrice: 1.4,
    outputPrice: 4.4,
    endpoint: "openai",
  },
  "proxy/qwen3.7-plus": {
    upstream: "qwen3.7-plus",
    context: 1048576,
    maxOutput: 65536,
    thinking: false,
    inputPrice: 0.4,
    outputPrice: 1.6,
    endpoint: "anthropic",
  },
  "proxy/qwen3.7-max": {
    upstream: "qwen3.7-max",
    context: 1048576,
    maxOutput: 65536,
    thinking: true,
    inputPrice: 2.5,
    outputPrice: 7.5,
    endpoint: "anthropic",
  },
  "proxy/qwen3.6-plus": {
    upstream: "qwen3.6-plus",
    context: 1048576,
    maxOutput: 65536,
    thinking: false,
    inputPrice: 0.5,
    outputPrice: 3.0,
    endpoint: "anthropic",
  },
  "proxy/deepseek-v4-flash": {
    upstream: "deepseek-v4-flash",
    context: 1048576,
    maxOutput: 384000,
    thinking: true,
    inputPrice: 0.14,
    outputPrice: 0.28,
    endpoint: "openai",
  },
  "proxy/deepseek-v4-pro": {
    upstream: "deepseek-v4-pro",
    context: 1048576,
    maxOutput: 384000,
    thinking: true,
    inputPrice: 1.74,
    outputPrice: 3.48,
    endpoint: "openai",
  },
};

export const PASSTHROUGH_MODELS = new Set([
  "mimo-v2.5",
  "mimo-v2.5-pro",
  "minimax-m3",
  "minimax-m2.7",
]);

export function getBrainEntry(modelId: string): BrainModelEntry | undefined {
  return BRAIN_MODELS[modelId];
}

export function isPassthrough(modelId: string): boolean {
  return PASSTHROUGH_MODELS.has(modelId);
}

export function parseProxyModelId(modelId: string): string | null {
  if (modelId.startsWith("proxy/")) {
    return modelId.substring(6);
  }
  return null;
}

export function isKnownModel(modelId: string): boolean {
  return modelId in BRAIN_MODELS || PASSTHROUGH_MODELS.has(modelId);
}