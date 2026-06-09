# CLAUDE.md — DeepSeek Multimodal Proxy

## Language
- **Chat**: Spanish
- **Code comments**: Spanish
- **Git (commits, PRs, branches)**: English
- **Docs (README, MODELS.md)**: Spanish

## Architecture
- Pattern: "Cortex Sensorial v2" — DeepSeek = brain, Gemini 2.5 Flash = senses, proxy = router
- Text/code -> DeepSeek direct; media -> Gemini description -> DeepSeek
- No third-party vision alternatives without explicit approval (Qwen, MiniMax were evaluated and reverted)

## Models
- Brain: `deepseek-v4-flash` (fast) and `deepseek-v4-pro` (strong)
- Senses: `gemini-2.5-flash` (cheapest that covers image + audio + video)
- Both DeepSeek models use `reasoning_effort: "max"` by default
- Proxy model IDs: `deepseek-multimodal-flash`, `deepseek-multimodal-pro`, `vision-direct`

## Token Limits
- DeepSeek context: 872K (1M native minus 128K slack for client headers)
- DeepSeek output: 384K (V4 max)
- Always leave headroom for OpenCode/Claude Code header injection

## Pricing
- Always calculate combined worst-case (vision model + DeepSeek) and present in README
- Verify against official API pricing pages before committing numbers
- Current: Flash $0.44/$2.78, Pro $0.74/$3.37, vision-direct $0.30/$2.50 per 1M (Gemini 2.5 Flash + DeepSeek V4 combined)

## Code Quality
- Build must pass (`npm run build`)
- All unit tests must pass (`npm run test:unit`)
- Lint clean (`npm run lint`)
- No dead code (imageDetector was deleted for this reason)
- DRY: extract repeated logic into helpers (buildPayload, extractAssistantContent)
- Validate env vars in constructor (reasoning_effort only "high" or "max")
- Use exact string matches for model routing, not includes/prototype checks

## Environment
- Windows primary dev environment (PowerShell 7+)
- Node.js >= 20.x
- API keys in `.env` (never committed, in .gitignore)
- Required: `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`
- Docker: `restart: always`, compose reads `.env`

## Git
- Feature branches: `feat/<desc>`, `fix/<desc>`, `chore/<desc>`
- Conventional commits in English
- PR to main, squash merge via `gh pr merge --squash`
- Delete local + remote branch after merge

## Services
- `src/services/deepseekService.ts`: DeepSeek V4 API (OpenAI-compatible)
- `src/services/geminiService.ts`: Gemini API via @google/generative-ai SDK
- `src/services/anthropicAdapter.ts`: Claude Code <-> OpenAI translation
- `src/middleware/multimodalDetector.ts`: Content type detection + routing
- `src/middleware/multimodalProcessor.ts`: Orchestrates vision + text pipeline

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
