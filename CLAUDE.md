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
- Context windows: GLM-5.2 and DeepSeek V4 Pro are 800K; Qwen3.7 Max and MiMo V2.5 Pro are 1M
- Passthrough (natively multimodal): `mimo-v2.5`
- Claude Code aliases: `haiku` → `mimo-v2.5` (passthrough), `sonnet` → `proxy/deepseek-v4-pro` (default), `opus` → `proxy/glm-5.2` (default)
- Senses: MiMo V2.5 for images (mimo-v2.5 multimodal native), Gemini for audio/video/PDFs

## Token Limits
- Per brain — see `src/services/brainRegistry.ts`
- GLM-5.2: 800K ctx (headroom for image descriptions), 131K output
- DeepSeek V4 Pro: 800K ctx (headroom for image descriptions), 384K output
- Qwen3.7 Max: 1M ctx, 65K output
- MiMo V2.5 Pro: 1M ctx, 65K output

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