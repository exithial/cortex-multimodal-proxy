import type { BrainModelEntry } from "./brainProvider";

export type { BrainModelEntry } from "./brainProvider";

export const BRAIN_MODELS_BASE: Record<string, BrainModelEntry> = {
  "proxy/glm-5.2": {
    upstream: "glm-5.2",
    context: 1_048_576,
    maxOutput: 131072,
    thinking: true,
    inputPrice: 1.4,
    outputPrice: 4.4,
    endpoint: "openai",
    multimodal: false,
  },
  "proxy/deepseek-v4-pro": {
    upstream: "deepseek-v4-pro",
    context: 1_048_576,
    maxOutput: 384000,
    thinking: true,
    inputPrice: 0.435,
    outputPrice: 0.87,
    endpoint: "openai",
    multimodal: false,
  },
  "proxy/qwen3.7-max": {
    upstream: "qwen3.7-max",
    context: 1_048_576,
    maxOutput: 65_536,
    thinking: true,
    inputPrice: 2.5,
    outputPrice: 7.5,
    endpoint: "anthropic",
    multimodal: false,
  },
  "proxy/mimo-v2.5-pro": {
    upstream: "mimo-v2.5-pro",
    context: 1_048_576,
    maxOutput: 65_536,
    thinking: true,
    inputPrice: 1.74,
    outputPrice: 3.48,
    endpoint: "openai",
    multimodal: false,
  },
};

export const PASSTHROUGH_MODELS = new Set([
  "mimo-v2.5",
  "MiniMax-M3",
]);

const PROXY_PREFIX = "proxy/";
const LOCAL_PROXY_PREFIX = "proxy/local-";

const BRAIN_MODELS_RUNTIME = new Map<string, BrainModelEntry>();

export function registerBrainEntry(id: string, entry: BrainModelEntry): void {
  BRAIN_MODELS_RUNTIME.set(id, entry);
}

export function resetBrainRegistry(): void {
  BRAIN_MODELS_RUNTIME.clear();
}

export function getBrainModels(): Record<string, BrainModelEntry> {
  const merged: Record<string, BrainModelEntry> = { ...BRAIN_MODELS_BASE };
  for (const [id, entry] of BRAIN_MODELS_RUNTIME) {
    merged[id] = entry;
  }
  return merged;
}

export function getBrainEntry(modelId: string): BrainModelEntry | undefined {
  const models = getBrainModels();
  return Object.hasOwn(models, modelId) ? models[modelId] : undefined;
}

export function isPassthrough(modelId: string): boolean {
  return PASSTHROUGH_MODELS.has(modelId);
}

export function parseProxyModelId(modelId: string): string | null {
  if (!modelId.startsWith(PROXY_PREFIX)) return null;
  const upstream = modelId.slice(PROXY_PREFIX.length);
  return upstream || null;
}

export function parseLocalProxyModelId(modelId: string): string | null {
  if (!modelId.startsWith(LOCAL_PROXY_PREFIX)) return null;
  const upstream = modelId.slice(LOCAL_PROXY_PREFIX.length);
  if (!upstream) return null;
  if (!Object.hasOwn(getBrainModels(), modelId)) return null;
  return upstream;
}

export function isKnownModel(modelId: string): boolean {
  // NOTE: This uses the unfiltered merged view (BRAIN_MODELS_BASE + runtime),
  // which means in `deepseek` or `hybrid` mode, a request for a model that
  // belongs only to the inactive provider passes the check here but then falls
  // through to the active provider and gets rejected by the upstream API.
  // The dispatch in src/index.ts surfaces a clear "unknown model" error for
  // unmapped IDs. For mapped-but-dispatched-to-wrong-provider IDs, accept that
  // the upstream returns a 400 — that signal is enough for the caller to know.
  return Object.hasOwn(getBrainModels(), modelId) || PASSTHROUGH_MODELS.has(modelId);
}