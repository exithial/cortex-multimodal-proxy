export interface BrainModelEntry {
  upstream: string;
  context: number;
  maxOutput: number;
  thinking: boolean;
  inputPrice: number;
  outputPrice: number;
  endpoint: "openai" | "anthropic";
  multimodal: boolean;
}

export const BRAIN_MODELS: Record<string, BrainModelEntry> = {
  "proxy/glm-5.2": {
    upstream: "glm-5.2",
    context: 819200,
    maxOutput: 131072,
    thinking: true,
    inputPrice: 1.4,
    outputPrice: 4.4,
    endpoint: "openai",
    multimodal: false,
  },
  "proxy/deepseek-v4-pro": {
    upstream: "deepseek-v4-pro",
    context: 819200,
    maxOutput: 384000,
    thinking: true,
    inputPrice: 1.74,
    outputPrice: 3.48,
    endpoint: "openai",
    multimodal: false,
  },
};

export const PASSTHROUGH_MODELS = new Set([
  "mimo-v2.5",
]);

const PROXY_PREFIX = "proxy/";

export function getBrainEntry(modelId: string): BrainModelEntry | undefined {
  return Object.hasOwn(BRAIN_MODELS, modelId) ? BRAIN_MODELS[modelId] : undefined;
}

export function isPassthrough(modelId: string): boolean {
  return PASSTHROUGH_MODELS.has(modelId);
}

export function parseProxyModelId(modelId: string): string | null {
  if (!modelId.startsWith(PROXY_PREFIX)) return null;
  const upstream = modelId.slice(PROXY_PREFIX.length);
  return upstream || null;
}

export function isKnownModel(modelId: string): boolean {
  return Object.hasOwn(BRAIN_MODELS, modelId) || PASSTHROUGH_MODELS.has(modelId);
}