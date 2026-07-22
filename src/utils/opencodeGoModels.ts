import { PASSTHROUGH_MODELS } from "../services/brainRegistry";
import { getActiveBrainModels, getActiveProviderInfo } from "../services/providerSelector";

export function getOpenCodeModelsList(): any[] {
  const brainModels = Object.entries(getActiveBrainModels()).map(
    ([id, entry]) => ({
      id,
      object: "model" as const,
      created: 1706745600,
      owned_by: "cortex-multimodal-proxy",
      permission: [],
      root: entry.upstream,
      parent: null,
    }),
  );

  // Passthroughs disponibles según el modo activo:
  //   - mimo-v2.5: requiere OpenCode Go (opencode/hybrid modes)
  //   - MiniMax-M3: requiere MiniMax M3 API (deepseek/hybrid modes)
  const mode = getActiveProviderInfo().mode;
  const passthroughModels = Array.from(PASSTHROUGH_MODELS)
    .filter((id) => {
      if (id === "mimo-v2.5") {
        return mode === "opencode" || mode === "hybrid";
      }
      if (id === "MiniMax-M3") {
        return mode === "deepseek" || mode === "hybrid";
      }
      return false;
    })
    .map((id) => ({
      id,
      object: "model" as const,
      created: 1706745600,
      owned_by:
        id === "mimo-v2.5"
          ? "opencode-go"
          : id === "MiniMax-M3"
            ? "minimax"
            : "cortex-multimodal-proxy",
      permission: [],
      root: id,
      parent: null,
    }));

  return [...brainModels, ...passthroughModels];
}

export function getClaudeCodeModelsList(): any[] {
  return [
    {
      id: process.env.CLAUDE_HAIKU_MODEL || "mimo-v2.5",
      object: "model",
      created: 1706745600,
      owned_by: "anthropic",
    },
    {
      id: process.env.CLAUDE_SONNET_MODEL || "proxy/deepseek-v4-pro",
      object: "model",
      created: 1706745600,
      owned_by: "anthropic",
    },
    {
      id: process.env.CLAUDE_OPUS_MODEL || "proxy/glm-5.2",
      object: "model",
      created: 1706745600,
      owned_by: "anthropic",
    },
  ];
}