# CLAUDE.md — Cortex Multimodal Proxy

## Language
- **Chat**: Spanish
- **Code comments**: Spanish
- **Git (commits, PRs, branches)**: English
- **Docs (README, MODELS.md, all documentation)**: English

## Architecture
- Pattern: "Cortex Sensorial v3" — 4 brains + 1 passthrough via OpenCode Go + MiMo V2.5 senses + Gemini fallback
- Text/code -> proxy/<brain> direct; images -> MiMo V2.5 -> brain; audio/video/PDF -> Gemini -> brain
- Brain selection: `proxy/<model-id>` for text-only models, passthrough for natively multimodal
- Natively multimodal model (mimo-v2.5) bypasses the senses layer
- All brains use max thinking (`thinking: { type: "enabled" }`)
- Retry with exponential backoff (3 attempts, 2s/4s delays) on503/502/429

## Compatibility
- **Primary clients**: OpenCode (OpenAI-compatible `/v1/chat/completions`) and Claude Code (Anthropic-compatible `/v1/messages`)
- Every feature, refactor, and dependency change MUST preserve full compatibility with both clients
- No breaking changes to the API contract without explicit opt-in via custom header
- Rate limiting, fallbacks, and toggles must have localhost/127.0.0.1 bypass
- After any change to routes, streaming, or model mapping, test against real OpenCode and Claude Code when possible
- The proxy exists solely to serve these two clients — compatibility is non-negotiable

## Models
- Brain options (text-only via `proxy/` prefix): `proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro`
- All brains: thinking enabled
- Endpoints: `proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/mimo-v2.5-pro` use OpenAI-format (`/chat/completions`); `proxy/qwen3.7-max` uses Anthropic-format (`/messages`)
- Context windows: ALL brains accept **1M** upstream natively — the proxy sends up to 1M to them — but clients see **800K** in `opencode.json`/`/v1/models` so they auto-compact before reaching the limit. The 200K gap is headroom for MiMo senses image descriptions. See `Brain context window policy` below.
- Passthrough (natively multimodal): `mimo-v2.5`
- Claude Code aliases: `haiku` → `mimo-v2.5` (passthrough), `sonnet` → `proxy/deepseek-v4-pro` (default), `opus` → `proxy/glm-5.2` (default)
- Senses: MiMo V2.5 for images (mimo-v2.5 multimodal native), Gemini for audio/video/PDFs

## Token Limits
- Per brain — see `src/services/brainRegistry.ts`
- GLM-5.2: 1M ctx upstream; clients see 800K (auto-compact target), 131K output
- DeepSeek V4 Pro: 1M ctx upstream; clients see 800K (auto-compact target), 384K output
- Qwen3.7 Max: 1M ctx upstream; clients see 800K (auto-compact target), 65K output
- MiMo V2.5 Pro: 1M ctx upstream; clients see 800K (auto-compact target), 65K output

### Brain context window policy
There are TWO context values per brain — do not confuse them:

1. **`BrainModelEntry.context` in `src/services/brainRegistry.ts`** — the **real upstream limit**. The proxy truncates user history at this value before sending to the brain via `truncateMessages` (see `src/services/messageTransforms.ts`). Set this to whatever the upstream model truly accepts. **All 4 current brains accept 1M upstream**, so `BrainModelEntry.context = 1_048_576` for all of them.

2. **`limit.context` in `opencode.json`** (and the `opencode.json` example in `README.md`, the Brain Models table in `MODELS.md`, and anything else shown to OpenCode clients) — the **client-visible auto-compact target**. The client reads this to decide when to compact its own history. Set this to **800K** for every brain that uses the MiMo senses pipeline, regardless of the real upstream limit.

The 200K gap between client-visible 800K and the upstream 1M is **mandatory headroom for vision**: when a request contains an image, `mimoSensesService.describeImage` returns a text description that is injected into the messages before the brain call (`multimodalProcessor.ts` lines 195-228). Complex images can produce 100K+ token descriptions. If the client packs history up to the 1M upstream limit, the proxy then injects the image description and exceeds the upstream's hard cap → request fails. By telling the client "800K", the client auto-compacts first, leaving the proxy room to inject the description without a race condition.

**When adding a new brain:** `BrainModelEntry.context` = real upstream limit (e.g., 1M for 1M models); `limit.context` in `opencode.json` and `README.md` = 800K for any brain on the MiMo senses pipeline.

### Anthropic → OpenAI streaming conversion
When a brain has `endpoint: "anthropic"` (currently `proxy/qwen3.7-max`) but the client speaks OpenAI-format (e.g. OpenCode TUI over `/v1/chat/completions`), the upstream's Anthropic SSE events are converted to OpenAI `ChatCompletionChunk` shape on the fly. Implemented in `OpenCodeGoService.convertAnthropicChunkToOpenAI`:

| Anthropic event | OpenAI chunk |
|-----------------|--------------|
| `content_block_start` (text) | (skipped — first `text_delta` opens the choice) |
| `content_block_start` (tool_use) | `choices[0].delta.tool_calls[0]` with `id`, `type: "function"`, `function.name` |
| `content_block_delta.text_delta` | `choices[0].delta.content` |
| `content_block_delta.thinking_delta` | `choices[0].delta.reasoning_content` |
| `content_block_delta.input_json_delta` | `choices[0].delta.tool_calls[0].function.arguments` (chunk accumulates via `tool_calls[].index`) |
| `message_delta` (stop_reason) | `choices[0].finish_reason` (`end_turn`→`stop`, `max_tokens`→`length`, `tool_use`→`tool_calls`) |
| `message_start`, `content_block_stop`, `message_stop`, `ping` | filtered (no OpenAI equivalent) |

`reasoning_content` is a DeepSeek/opencode extension to the OpenAI streaming schema, not part of standard OpenAI. Clients that strictly validate against OpenAI's ChatCompletionChunk schema may ignore it; in practice the OpenCode TUI, Claude Code, and the OpenAI Node SDK all surface it as a separate reasoning channel.

## Pricing
- Always calculate combined worst-case (MiMo senses + brain) and present in README
- MiMo V2.5 senses: $0.14 in / $0.28 out per 1M tokens
- GLM-5.2: $1.40 in / $4.40 out per 1M
- DeepSeek V4 Pro: $1.74 in / $3.48 out per 1M
- Qwen3.7 Max: $2.50 in / $7.50 out per 1M
- MiMo V2.5 Pro: $1.74 in / $3.48 out per 1M
- Combined worst-case: GLM-5.2 ($1.54/$4.40), DeepSeek V4 Pro ($1.88/$3.48), Qwen3.7 Max ($2.64/$7.78), MiMo V2.5 Pro ($1.88/$3.76)

## Code Quality
- Build must pass (`npm run build`)
- All unit tests must pass (`npm run test:unit`)
- Lint clean (`npm run lint`)
- No dead code
- DRY: extract repeated logic into helpers (buildPayload, truncateMessages, prepareMessages in `src/services/messageTransforms.ts`)
- Validate env vars in constructor (opencodeGoService throws if OPENCODE_GO_API_KEY missing)
- Use exact string matches for model routing, not includes/prototype checks
- Use `Object.hasOwn()` for registry checks (prototype safety)

## Environment
- Windows primary dev environment (PowerShell 7+)
- Node.js >= 20.x
- API keys in `.env` (never committed, in .gitignore)
- Required: `OPENCODE_GO_API_KEY`
- Optional: `GEMINI_API_KEY` (only for audio/video/PDF fallback)
- Docker: `restart: always`, compose reads `.env`

## Git
- Feature branches: `feat/<desc>`, `fix/<desc>`, `chore/<desc>`
- Conventional commits in English
- PR to main, squash merge via `gh pr merge --squash`
- Delete local + remote branch after merge

## Services
- `src/services/opencodeGoService.ts`: Generic OpenCode Go caller with retry logic for all brain models + passthrough
- `src/services/mimoSensesService.ts`: MiMo V2.5 image description
- `src/services/geminiService.ts`: Gemini fallback for audio/video/PDF (still required for non-image media)
- `src/services/brainRegistry.ts`: 4 brain entries + 1 passthrough model + helpers (getBrainEntry, isPassthrough, parseProxyModelId, isKnownModel)
- `src/services/messageTransforms.ts`: Shared truncateMessages and prepareMessages helpers
- `src/services/anthropicAdapter.ts`: Claude Code ↔ OpenAI translation
- `src/middleware/multimodalDetector.ts`: Content type detection
- `src/middleware/multimodalProcessor.ts`: Orchestrates vision-mimo + Gemini fallback + local PDF routing

## Testing
- Unit tests: Vitest, fast, no API keys needed
- Integration tests: `test/test-master.js`, `test/test-claude-code.js` (require real APIs)
- Coverage via `npm run test:coverage`

## Docker
- `npm run docker:up` / `docker:down` / `docker:logs`
- Volume for cache persistence: `proxy-cache:/app/cache`
- Healthcheck on `/health` endpoint

## Prohibited
- Never commit .env or API keys
- Never add agent signatures to commits
- Never use emojis in git messages
- Never create PRs/commits unless explicitly asked
- Never hardcode secrets, tokens, or credentials