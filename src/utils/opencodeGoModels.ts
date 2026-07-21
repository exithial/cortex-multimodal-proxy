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

  // mimo-v2.5 requiere OpenCode Go. Solo exponer en modos donde OpenCode Go
  // es la infra activa (opencode, hybrid, o auto que resuelve a opencode).
  const mode = getActiveProviderInfo().mode;
  const opencodeGoMode = mode === "opencode" || mode === "hybrid";
  const passthroughModels = opencodeGoMode
    ? Array.from(PASSTHROUGH_MODELS).map((id) => ({
        id,
        object: "model" as const,
        created: 1706745600,
        owned_by: "opencode-go",
        permission: [],
        root: id,
        parent: null,
      }))
    : [];

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