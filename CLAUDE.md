# CLAUDE.md — Cortex Multimodal Proxy

## Language
- **Chat**: Spanish
- **Code comments**: Spanish
- **Git (commits, PRs, branches)**: English
- **Docs (README, MODELS.md, all documentation)**: English

## Architecture
- Pattern: "Cortex Sensorial v3" — 9 brains via OpenCode Go + MiMo V2.5 senses + Gemini fallback
- Text/code -> proxy/<brain> direct; media -> MiMo V2.5 (images) or Gemini (audio/video/PDF) -> brain
- Brain selection: `proxy/<model-id>` for text-only models, passthrough for natively multimodal
- Natively multimodal models (mimo-v2.5, mimo-v2.5-pro, minimax-m3, minimax-m2.7) bypass the senses layer

## Compatibility
- **Primary clients**: OpenCode (OpenAI-compatible `/v1/chat/completions`) and Claude Code (Anthropic-compatible `/v1/messages`)
- Every feature, refactor, and dependency change MUST preserve full compatibility with both clients
- No breaking changes to the API contract without explicit opt-in via custom header
- Rate limiting, fallbacks, and toggles must have localhost/127.0.0.1 bypass
- After any change to routes, streaming, or model mapping, test against real OpenCode and Claude Code when possible
- The proxy exists solely to serve these two clients — compatibility is non-negotiable

## Models
- Brain options (text-only via `proxy/` prefix): `proxy/kimi-k2.7-code`, `proxy/kimi-k2.6`, `proxy/glm-5.2`, `proxy/glm-5.1`, `proxy/qwen3.7-plus`, `proxy/qwen3.7-max`, `proxy/qwen3.6-plus`, `proxy/deepseek-v4-flash`, `proxy/deepseek-v4-pro`
- Passthrough (natively multimodal): `mimo-v2.5`, `mimo-v2.5-pro`, `minimax-m3`, `minimax-m2.7`
- Legacy (deprecated): `vision-direct` (uses Gemini direct)
- Claude Code aliases: `haiku` → `mimo-v2.5` (passthrough), `sonnet` → `proxy/kimi-k2.6` (default), `opus` → `proxy/glm-5.2` (default)
- Senses: MiMo V2.5 for images (mimo-v2.5 multimodal native), Gemini for audio/video/PDFs
- Anthropic-format models (Qwen) use `/messages` endpoint at OpenCode Go; OpenAI-format (GLM, Kimi, DeepSeek, MiMo) use `/chat/completions`

## Token Limits
- Per brain — see `src/services/brainRegistry.ts`. Note: proxy exposes smaller than native context to leave headroom for headers and proxy work.
- Qwen3.7 Max/Plus, Qwen3.6 Plus, GLM-5.2, DeepSeek V4: 1M ctx
- GLM-5.1: 202K ctx
- Kimi K2.7 Code/K2.6: 262K ctx

## Pricing
- Always calculate combined worst-case (vision model + brain) and present in README
- Verify against official API pricing pages before committing numbers
- MiMo V2.5 senses: $0.14 in / $0.28 out per 1M
- Brain prices vary — see brainRegistry

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
- `src/services/opencodeGoService.ts`: Generic OpenCode Go caller for all 9 brain models + passthrough
- `src/services/mimoSensesService.ts`: MiMo V2.5 image description
- `src/services/geminiService.ts`: Gemini fallback for audio/video/PDF (still required for non-image media)
- `src/services/brainRegistry.ts`: 9 brain entries + 4 passthrough models + helpers (getBrainEntry, isPassthrough, parseProxyModelId, isKnownModel)
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