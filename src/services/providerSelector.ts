import { logger } from "../utils/logger";
import { opencodeGoBrainProvider } from "./opencodeGoBrainProvider";
import { deepseekBrainProvider } from "./deepseekBrainProvider";
import { mimoSensesVisionProvider } from "./mimoSensesVisionProvider";
import { minimaxM3VisionProvider } from "./minimaxM3VisionProvider";
import {
  BRAIN_MODELS_BASE,
  registerBrainEntry,
  resetBrainRegistry,
  getBrainModels,
} from "./brainRegistry";
import type {
  BrainModelEntry,
  BrainProvider,
} from "./brainProvider";
import type { VisionProvider } from "./visionProvider";

export type ResolvedMode = "opencode" | "deepseek" | "hybrid";

export interface ProviderInfo {
  mode: ResolvedMode;
  brainProviderName: string;
  visionProviderName: string | null;
  visionProviderAvailable: boolean;
  brainIds: string[];
  primaryBrainProviderName: string;
  hybridProviders: string[];
}

function readBRAIN_MODE(): string {
  return (process.env.BRAIN_MODE ?? "auto").toLowerCase().trim();
}

export function resolveMode(): ResolvedMode {
  const raw = readBRAIN_MODE();
  const hasOpencode = !!process.env.OPENCODE_GO_API_KEY;
  const hasDeepseek = !!process.env.DEEPSEEK_API_KEY;
  const hasMinimax = !!process.env.MINIMAX_API_KEY;

  if (raw === "opencode" || raw === "deepseek" || raw === "hybrid") {
    if (raw === "opencode" && !hasOpencode) {
      throw new Error("BRAIN_MODE=opencode requiere OPENCODE_GO_API_KEY en .env");
    }
    if (raw === "deepseek" && !hasDeepseek) {
      throw new Error("BRAIN_MODE=deepseek requiere DEEPSEEK_API_KEY en .env");
    }
    if (raw === "hybrid" && !hasOpencode && !hasDeepseek) {
      throw new Error(
        "BRAIN_MODE=hybrid requiere OPENCODE_GO_API_KEY o DEEPSEEK_API_KEY",
      );
    }
    return raw;
  }

  // auto or any unrecognized value treated as auto
  if (hasDeepseek) {
    if (hasOpencode) {
      logger.warn(
        "OPENCODE_GO_API_KEY presente pero ignorado porque DEEPSEEK_API_KEY ganó (BRAIN_MODE=auto). Set BRAIN_MODE=hybrid para usar ambos.",
      );
    }
    return "deepseek";
  }
  if (hasOpencode) return "opencode";

  throw new Error(
    "No hay API key de brain configurada. Set OPENCODE_GO_API_KEY (modo opencode), DEEPSEEK_API_KEY (modo deepseek), o ambas (BRAIN_MODE=hybrid).",
  );
}

function registerDeepSeekEntries(prefix: "proxy/" | "proxy/local-"): void {
  const proEntry: BrainModelEntry = {
    upstream: "deepseek-v4-pro",
    context: 1_048_576,
    maxOutput: 384_000,
    thinking: true,
    inputPrice: 0.435,
    outputPrice: 0.87,
    endpoint: "openai",
    multimodal: false,
    providerName: "deepseek-direct",
  };
  const flashEntry: BrainModelEntry = {
    upstream: "deepseek-v4-flash",
    context: 1_048_576,
    maxOutput: 384_000,
    thinking: true,
    inputPrice: 0.14,
    outputPrice: 0.28,
    endpoint: "openai",
    multimodal: false,
    providerName: "deepseek-direct",
  };
  registerBrainEntry(`${prefix}deepseek-v4-pro`, proEntry);
  registerBrainEntry(`${prefix}deepseek-v4-flash`, flashEntry);
}

let cachedMode: ResolvedMode | null = null;
let cachedBrainProvider: BrainProvider | null = null;
let cachedVisionProvider: VisionProvider | null = null;
let cachedVisionAvailable = false;
let cachedInfo: ProviderInfo | null = null;

function ensureInitialized(): ProviderInfo {
  if (cachedInfo) return cachedInfo;

  resetBrainRegistry();
  const mode = resolveMode();
  cachedMode = mode;

  if (mode === "deepseek") {
    registerDeepSeekEntries("proxy/");
    cachedBrainProvider = deepseekBrainProvider;
    if (process.env.MINIMAX_API_KEY) {
      cachedVisionProvider = minimaxM3VisionProvider;
      cachedVisionAvailable = true;
    } else {
      logger.warn(
        "MINIMAX_API_KEY no presente en modo deepseek. Vision deshabilitada; contenido multimodal fallará con error claro.",
      );
      cachedVisionProvider = null;
      cachedVisionAvailable = false;
    }
  } else if (mode === "opencode") {
    cachedBrainProvider = opencodeGoBrainProvider;
    cachedVisionProvider = mimoSensesVisionProvider;
    cachedVisionAvailable = true;
  } else {
    // hybrid
    registerDeepSeekEntries("proxy/local-");
    cachedBrainProvider = opencodeGoBrainProvider;
    if (process.env.MINIMAX_API_KEY) {
      cachedVisionProvider = minimaxM3VisionProvider;
    } else {
      cachedVisionProvider = mimoSensesVisionProvider;
    }
    cachedVisionAvailable = true;
  }

  const brainIds = Object.keys(getBrainModels()).sort();
  cachedInfo = {
    mode,
    brainProviderName: cachedBrainProvider.name,
    visionProviderName: cachedVisionProvider?.name ?? null,
    visionProviderAvailable: cachedVisionAvailable,
    brainIds,
    primaryBrainProviderName: cachedBrainProvider.name,
    hybridProviders:
      mode === "hybrid"
        ? Array.from(
            new Set(
              Object.values(getBrainModels()).map(
                (e) => e.providerName ?? "opencode-go",
              ),
            ),
          )
        : [],
  };
  return cachedInfo;
}

export function getActiveBrainProvider(): BrainProvider {
  return ensureInitialized().primaryBrainProviderName === "" || !cachedBrainProvider
    ? opencodeGoBrainProvider
    : cachedBrainProvider;
}

export function getActiveBrainProviderFor(modelId: string): BrainProvider {
  const entry = getBrainModels()[modelId];
  if (!entry || !entry.providerName) {
    return ensureInitialized().primaryBrainProviderName === "opencode-go"
      ? opencodeGoBrainProvider
      : deepseekBrainProvider;
  }
  if (entry.providerName === "deepseek-direct") return deepseekBrainProvider;
  return opencodeGoBrainProvider;
}

export function getActiveVisionProvider(): VisionProvider | null {
  ensureInitialized();
  return cachedVisionProvider;
}

export function getActiveBrainModels(): Record<string, BrainModelEntry> {
  const models = getBrainModels();
  const info = ensureInitialized();
  if (info.mode === "deepseek") {
    return Object.fromEntries(
      Object.entries(models).filter(
        ([, e]) => e.providerName === "deepseek-direct",
      ),
    );
  }
  return models;
}

export function getActiveProviderInfo(): ProviderInfo {
  return ensureInitialized();
}

// Eagerly init at module load to surface startup errors immediately.
// (The lazy init above still works for tests that want to reset env.)
// eslint-disable-next-line no-useless-catch
try {
  ensureInitialized();
} catch (err) {
  throw err;
}

void BRAIN_MODELS_BASE; // keep base import to ensure the module side-effects apply