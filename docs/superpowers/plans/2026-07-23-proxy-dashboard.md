# Proxy Dashboard — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-23-proxy-dashboard-design.md`
**Branch:** `feat/proxy-dashboard`
**Slug:** `proxy-dashboard`
**Date:** 2026-07-23

## Goal

Ship an informational dashboard on the proxy that exposes consumption (tokens, cost), live logs, cache efficiency, and operational status. Same Express, same port 7777, namespace `/dashboard/*`. No auth (consistent with the rest of the proxy). Capture persists every request to SQLite via `better-sqlite3`; frontend is vanilla HTML + ES modules + custom CSS + `chart.js` from CDN.

## Success criteria

- `npm run build` and `npm run lint` and `npm run test:unit` all pass.
- Dashboard reachable at `http://<host>:7777/dashboard/` and `http://<host>:7777/v1/dashboard/snapshot`.
- After 1+ real request through `/v1/chat/completions` or `/v1/messages`, the dashboard shows non-zero totals, accurate token counts (matching the `usage` payload the client receives), and the correct `cache_hit` flag when applicable.
- `DASHBOARD_ENABLED=false` cleanly disables capture without breaking the proxy.
- Existing integration tests (`test/test-master.js`, `test/test-claude-code.js`) continue to pass against a real upstream (no regressions in `/v1/chat/completions`, `/v1/messages`, `/health`, `/v1/models`, `/v1/cache/stats`).

## Files affected (summary)

New files:
- `src/services/dashboardService.ts`
- `src/routes/dashboard.ts`
- `public/dashboard/index.html`
- `public/dashboard/app.js`
- `public/dashboard/styles.css`
- `tests/unit/services/dashboardService.test.ts`
- `tests/integration/dashboard.test.ts` (vitest, in-process Express with mocked brain)

Modified files:
- `src/index.ts` (mount static + snapshot route, hook capture in both chat/messages handlers, init `dashboardService` in `init()`, wire retention interval)
- `src/middleware/multimodalProcessor.ts` (extend `processMultimodalContent` return with `descriptions_cache_hits: number`)
- `package.json` (`better-sqlite3` dep, `@types/better-sqlite3` dev dep)
- `tsconfig.json` (if needed for SQLite types — likely fine as-is)
- `.env.example` (5 new env vars)
- `.gitignore` (add `data/`)
- `README.md` and `MODELS.md` (link to dashboard, document env vars)
- `docker-compose.yml` (volume for `data/`)
- `Dockerfile` (no change expected — `data/` lives inside `/app/data`, mounted as volume)

## Phases

### Phase 1 — Foundation: `dashboardService` + schema + tests (TDD)

**Files:** `src/services/dashboardService.ts`, `tests/unit/services/dashboardService.test.ts`, `package.json`, `.env.example`, `.gitignore`

1. **Test first** — `tests/unit/services/dashboardService.test.ts`:
   - `init()` creates DB + schema if absent (use tmp path)
   - `recordRequest()` inserts a row with all fields
   - `recordRequest()` is wrapped in try/catch (does not throw on DB error)
   - `getSnapshot()` returns `{ operational, metrics, recent_logs, cache_stats }` with the shape from the spec
   - `getSnapshot()` aggregates totals correctly (tokens in/out, cost, requests, errors, cache hits/ratio)
   - `getSnapshot()` produces zero-filled 24h hourly buckets + 30d daily buckets
   - `getSnapshot()` per-model and per-brain breakdowns are sorted by `request_count desc`
   - `getSnapshot()` computes latency p50/p95/avg per model/brain
   - Retention sweep deletes rows older than `DASHBOARD_RETENTION_DAYS`
   - `init()` recovers from corruption by renaming the bad file and starting fresh

2. **Implementation** — `src/services/dashboardService.ts`:
   - Singleton class with `init()`, `recordRequest()`, `getSnapshot()`, `runRetentionSweep()`, `close()`
   - Reads env vars in constructor: `DASHBOARD_ENABLED`, `DASHBOARD_DB_PATH` (default `./data/dashboard.db`), `DASHBOARD_RETENTION_DAYS` (default 90), `DASHBOARD_LOG_TAIL_LINES` (default 200), `DASHBOARD_POLL_INTERVAL_MS` (default 10000)
   - Opens SQLite via `better-sqlite3`; sets pragmas `journal_mode=WAL`, `synchronous=NORMAL` for perf
   - Runs schema migration (CREATE TABLE + INDEXES) on `init()`
   - `recordRequest({ ... })` is sync; wrapped in try/catch
   - `getSnapshot()` runs prepared queries: totals, hourly, daily, by_model, by_brain
   - Latency percentiles: collect latencies into JS array, sort, pick index — small windows in SQLite make NTILE(100) overkill
   - Retention sweep scheduled via `setInterval(..., 60 * 60 * 1000)`; returns an `unref`'d timer so it doesn't block shutdown
   - Empty-DB posture: `recent_logs` returns `[]`, all numeric fields return 0, time-series arrays are zero-filled buckets

3. **Config**:
   - `package.json`: add `better-sqlite3` to dependencies, `@types/better-sqlite3` to devDependencies
   - `.env.example`: append a `# Dashboard` section with the 5 vars
   - `.gitignore`: add `data/`

4. **Verification**: `npm run test:unit -- dashboardService` → all tests green; `npm run lint` → clean; `npm run build` → succeeds.

### Phase 2 — Hooks in `/v1/chat/completions` and `/v1/messages`

**Files:** `src/index.ts`, `src/middleware/multimodalProcessor.ts`, `tests/integration/dashboard.test.ts`

1. **Extend `processMultimodalContent` return** — add `descriptions_cache_hits: number` field. Default to 0 for the `direct`/`vision`/`vision-mimo` paths. For the `local` (PDF) path, the descriptions cache currently does not apply — keep 0. Counter is incremented inside the vision-content loop when `vision.describeImage(...)` returns a description that came from `cacheService.get()` instead of a fresh call. To detect this cleanly, the vision providers (`MimoSensesVisionProvider`, `MiniMaxM3Provider`) must expose whether a hit occurred.

2. **Detect descriptions cache hit in vision providers** — add a `fromCache: boolean` to the return of `describeImage` / `describeVideo` in `MimoSensesVisionProvider` and `MiniMaxM3Provider`. Update `VisionProvider` interface accordingly. If the upstream API is invoked but the provider already pulled from `cacheService`, return `fromCache: true`. Alternatively (simpler): pass a counter object to `describeImage` and let it increment — less invasive.

   **Decision:** introduce `describeImage(source, ctx, opts?: { onCacheHit?: () => void })` — minimal API change. Increment in `processMultimodalContent` when `opts.onCacheHit` is called, and pass that count up as `descriptions_cache_hits`.

3. **Hook in `/v1/chat/completions`**:
   - Wrap both the streaming and non-streaming branches with a helper `tryRecord(...)` that calls `dashboardService.recordRequest(...)` inside try/catch.
   - Non-streaming: capture `usage` from the returned `response`.
   - Streaming: hook the `onComplete` callback to capture. `usage` may not be emitted by all providers in the final chunk — when absent, default to 0 (still useful for latency + status).
   - Error path: existing `catch` calls `tryRecord` with `status: "error"`.

4. **Hook in `/v1/messages`**:
   - Three cache-hit branches: `getCachedAnthropicResponse` hit, `inFlightAnthropic` join, `haiku` content-key defer. Mark each with `cache_hit=1`.
   - For non-cached paths: same capture pattern as `/v1/chat/completions` (streaming + non-streaming + error).
   - For the `finalContent` callback in streaming (where `cacheAnthropicResponse` is called), capture inside it.
   - Client detection: `req.headers["anthropic-version"]` is present → `"anthropic"`, else `"openai"`.

5. **Helper** — `tryRecord(payload: RecordRequestPayload): void` in `src/index.ts`:
   - Wraps `dashboardService.recordRequest` in try/catch, logs at warn.
   - Builds the payload from captured locals: `model`, `brain.upstream`, `strategy`, `latency_ms: Date.now() - startTime`, `cache_hit: <boolean>`, `client: "openai" | "anthropic"`, etc.

6. **Test** — `tests/integration/dashboard.test.ts`:
   - Boot Express with a mocked `BrainProvider` that returns a fixed response with `usage`.
   - POST `/v1/chat/completions` → assert event was inserted.
   - POST twice with the same body → assert second event has `cache_hit=0` (descriptions cache not involved).
   - Inject a request that goes through `processMultimodalContent` with an image and a mocked vision provider that calls `opts.onCacheHit()` → assert `cache_hit=1`.
   - Hit `/v1/messages` twice with identical bodies → assert second event has `cache_hit=1`.

7. **Verification**: `npm run test:unit -- dashboard` → green; `npm run build` → succeeds; `npm run lint` → clean.

### Phase 3 — Snapshot endpoint + static serving + route mounting

**Files:** `src/routes/dashboard.ts`, `src/index.ts`, `tests/integration/dashboard.test.ts`

1. **Route file** — `src/routes/dashboard.ts`:
   - Exports `mountDashboardRoutes(app: Express, deps: { startTime: number }): void`
   - `GET /v1/dashboard/snapshot` — calls `dashboardService.getSnapshot(...)`, merges with operational info, returns JSON. On DB error → 503 with `{ error: "dashboard unavailable" }`.
   - `GET /dashboard/*` — serves `public/dashboard/` via `express.static`. Falls back to `index.html` for `/dashboard` (no trailing slash) and `/dashboard/`.
   - `GET /dashboard/` — same as above (root of the SPA).
   - When `DASHBOARD_ENABLED=false`:
     - Static route still mounted (so users can see "disabled" page — or omit it entirely?). **Decision:** when disabled, the static route still serves `index.html` which renders a friendly "dashboard disabled" banner from `operational.dashboard_enabled=false`.
     - Snapshot endpoint returns 503 immediately without touching the DB.

2. **Mount in `src/index.ts`**:
   - Call `mountDashboardRoutes(app, { startTime: Date.now() })` after the `/health` route definition but before `init()` listens.
   - In `init()`, call `await dashboardService.init()` after `cacheService.init()`. If disabled, log and skip — but still mount the routes (for the disabled banner).

3. **Test**:
   - `GET /v1/dashboard/snapshot` returns valid JSON with the expected shape (use a seeded DB).
   - `GET /dashboard/` returns 200 with HTML containing the page title.
   - When `DASHBOARD_ENABLED=false`, snapshot returns 503.

4. **Verification**: `npm run test:unit -- dashboard` → green; `npm run build` → succeeds; `npm run lint` → clean.

### Phase 4 — Frontend: `index.html` + `app.js` + `styles.css` (vanilla, polished)

**Files:** `public/dashboard/index.html`, `public/dashboard/app.js`, `public/dashboard/styles.css`

This phase uses the `frontend-design` skill at implementation time for aesthetic choices. The plan specifies the structure and behavior; the skill decides typography, color, spacing, motion.

1. **`index.html`** — semantic HTML, six sections in order (header, hero cards, time-series chart, models table, log tail, footer). Uses ES module `<script type="module" src="app.js"></script>`. Loads `chart.js` from `https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js` (subresource integrity hash recorded in the HTML for tamper detection — hash can be added by the implementation step).

2. **`app.js`** — single ES module, no framework. Sections:
   - `init()` — fetch snapshot, render once, then `setInterval(pollAndRender, snapshot.operational.poll_interval_ms)`. Honors server-side cadence.
   - `fetchSnapshot()` — `fetch('/v1/dashboard/snapshot')`, parse JSON, throw on non-2xx.
   - `render(snapshot)` — dispatch to section renderers. Replaces DOM content; no virtual DOM.
   - `formatNumber(n)` — locale-aware with `Intl.NumberFormat`.
   - `formatDuration(seconds)` — `Xd Yh Zm`.
   - Error path: if a fetch fails, the live indicator turns red and a banner shows "stale data — last refresh Xs ago".
   - Charts: two `Chart` instances (24h tokens-in, 24h tokens-out as two datasets on one chart; 30d toggle reuses the same chart with different data). Destroy + recreate on toggle to keep code simple.

3. **`styles.css`** — custom CSS. Dark theme by default. Sections:
   - Reset / variables (`--bg`, `--fg`, `--accent`, `--muted`, `--success`, `--danger`)
   - Layout: `main` is a single column, max-width `1200px`, centered. Hero is CSS grid `repeat(6, 1fr)` on desktop, collapses via media queries.
   - Card design: `border-radius: 12px`, subtle `box-shadow`, `backdrop-filter: blur(10px)` over a subtle gradient backdrop.
   - Typography: monospace for numbers (`JetBrains Mono` via system fallback stack), sans for labels (`Inter` via system fallback stack).
   - Motion: `prefers-reduced-motion` respected; subtle pulse on the live indicator.
   - Aesthetic decisions are deferred to `frontend-design` skill at impl time.

4. **Verification** — manual in browser. No JS tests. Sanity check via `curl http://localhost:7777/dashboard/` returns HTML.

### Phase 5 — Docs, env vars, Docker, integration smoke

**Files:** `README.md`, `MODELS.md`, `.env.example`, `docker-compose.yml`, `Dockerfile`, `test/test-master.js`

1. **`.env.example`** — already updated in Phase 1; verify section is present and well-commented.

2. **`README.md`** — add a "Dashboard" section with:
   - URL: `http://<host>:7777/dashboard/`
   - Env var table (5 vars with defaults)
   - "Disable" instruction (`DASHBOARD_ENABLED=false`)
   - Note: same port as the proxy, no auth (consistent with the proxy's posture today)
   - Screenshot placeholder / ASCII layout sketch
   - "Rollback" sentence: set `DASHBOARD_ENABLED=false` and restart

3. **`MODELS.md`** — no change needed (dashboard is operational, not a brain).

4. **`docker-compose.yml`** — add `data/` volume mount under the proxy service:
   ```yaml
   volumes:
     - proxy-data:/app/data
   ```
   And add `proxy-data:` to the top-level `volumes:` block.

5. **`Dockerfile`** — no change (volume is mounted at runtime).

6. **`test/test-master.js`** — append a smoke check at the end:
   ```js
   const dashRes = await fetch(`${BASE}/v1/dashboard/snapshot`);
   // assert dashRes.status === 200 and body has expected shape
   ```
   Wrap in `try/catch` so the rest of the test continues if it fails.

7. **Verification**:
   - `docker compose up -d --build` succeeds.
   - `curl http://localhost:7777/v1/dashboard/snapshot` returns valid JSON.
   - `curl http://localhost:7777/dashboard/` returns HTML.
   - Real `/v1/chat/completions` round-trip → dashboard shows the event.
   - `npm run test:master` and `npm run test:claude` pass (require real API keys — out of scope for unit verification).

## Risks and rollback

- **Risk:** Hook in `/v1/chat/completions` or `/v1/messages` throws, breaking the response path. **Mitigation:** every `recordRequest` wrapped in try/catch with warn-level log. Verified by Phase 2 integration tests.
- **Risk:** `better-sqlite3` native binding fails to compile on the user's platform (e.g., Alpine in Docker, ARM without prebuilt). **Mitigation:** Phase 1 docs list this explicitly; clear error at startup with the missing-platform name; `DASHBOARD_ENABLED=false` bypasses.
- **Risk:** DB grows beyond disk budget. **Mitigation:** hourly retention sweep with `DASHBOARD_RETENTION_DAYS=90` default; spec caps DB at tens of MB for normal use.
- **Risk:** Concurrent writes from multiple handlers race. **Mitigation:** `better-sqlite3` is synchronous and SQLite serializes writes; WAL mode allows concurrent reads. No special handling needed.
- **Risk:** Static serving interferes with existing routes. **Mitigation:** namespace is `/dashboard/*` (and the snapshot endpoint is `/v1/dashboard/snapshot`). No collision with `/v1/chat/completions`, `/v1/messages`, `/health`, `/v1/models`, `/v1/cache/stats`, or `/api/event_logging/batch`. Static handler serves only `public/dashboard/` and uses a sub-path prefix, so no shadowing of root `/`.
- **Rollback:** set `DASHBOARD_ENABLED=false` in `.env` and restart the proxy. The dashboard route still serves the HTML page (showing "disabled" banner) but no DB writes happen and the snapshot endpoint returns 503. To fully remove, revert the merge commit.

## Parallelization

Phase 1 (dashboardService) and Phase 4 (frontend HTML/CSS/JS skeleton) are independent and could run in parallel. Phases 2-3 depend on Phase 1. Phase 5 depends on all prior phases. With one executor this is sequential; with two executors in worktrees, Phase 1 + Phase 4 can run concurrently after the spec is approved.

## Feature branch

`feat/proxy-dashboard`

## Verification gates (overall)

Before claiming completion, all of these must pass:

1. `npm run build` — TypeScript compiles cleanly.
2. `npm run lint` — ESLint clean (no errors; warnings are okay).
3. `npm run test:unit` — all vitest suites pass, including new `dashboardService.test.ts` and `dashboard.test.ts`.
4. Manual smoke: start the proxy, send a real `/v1/chat/completions` request, open `http://localhost:7777/dashboard/`, confirm the event appears within 10s with correct tokens and model.
5. `curl http://localhost:7777/v1/dashboard/snapshot` returns JSON with `operational.metrics` populated.
6. `DASHBOARD_ENABLED=false` → restart, snapshot returns 503, page shows "disabled".