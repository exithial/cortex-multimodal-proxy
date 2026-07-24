# Proxy Dashboard — Design Spec

**Status:** Draft
**Slug:** `proxy-dashboard`
**Date:** 2026-07-23
**Branch:** `feat/proxy-dashboard`

## Goal

Add an informational dashboard to the proxy that surfaces consumption (tokens, cost, requests), live logs, cache efficiency, and operational status — served from the same Express app on port 7777, namespace `/dashboard/*`.

Today the proxy has zero request telemetry: `usage` tokens are passed back to the client but never stored, and operational visibility is limited to logs and `/health`. The dashboard fills that gap without changing the OpenAI/Anthropic compatibility contract.

## Decisions log

This spec was shaped through brainstorming on 2026-07-23. All scope decisions:

> **Post-implementation addendum (2026-07-24):** two refinements were introduced during implementation and were not in the original brainstorm. They are now part of the contract and are listed inline below as decisions 10 and 11.

1. **Tracking scope:** Completo persistido. Capture `usage` (prompt_tokens, completion_tokens) from every request, derive cost from registry `inputPrice`/`outputPrice`, persist to SQLite with aggregations by hour/day/model, configurable retention.
2. **Persistence:** `better-sqlite3` (synchronous, mature native binding). Schema fijo, índices por `(ts, model, brain)`, retention via `DELETE WHERE ts < ?`.
3. **Frontend:** Vanilla HTML + ES modules + custom CSS, `chart.js` loaded from CDN. Served from `public/dashboard/`. No build pipeline.
4. **Route/security:** Same Express app, same port 7777. Namespace `/dashboard/*`. No auth (consistent with the rest of the proxy today).
5. **Metrics:** consumption (tokens in/out, cost, request count, error count, latency p50/p95/avg) + cache hits/misses/ratio. Desagregado por modelo y brain. Series temporales 24h (por hora) y 30 días (por día). Logs: tail de 200 líneas. Operacional: health, cache stats, modelos activos, uptime, versión.
6. **Live updates:** Polling puro. `GET /v1/dashboard/snapshot` cada 10 s. Logs refreshable on-demand con un botón.
7. **Retention:** 90 días default, env var `DASHBOARD_RETENTION_DAYS`.
8. **Cache hit semantics:** Boolean único `cache_hit` por request. `true` si cualquier cache sirvió algo (Anthropic dedupe O descriptions cache).
9. **Layout:** Single-page scroll. Hero con cards → chart 24h → tabla modelos → log tail.

## Architecture

Three new modules integrate with the existing proxy:

- `src/services/dashboardService.ts` — SQLite access layer. Owns the `events` table, the snapshot query, and the retention sweep. Exposes `init()`, `recordRequest()`, `getSnapshot()`, `close()`.
- `src/routes/dashboard.ts` — Mounts `GET /dashboard/*` (static files) and `GET /v1/dashboard/snapshot` (JSON).
- `public/dashboard/{index.html,app.js,styles.css}` — The frontend (no build step).

`dashboardService.init()` runs at proxy startup (after `cacheService.init()`), opens the DB, runs the schema migration, and schedules the hourly retention sweep via `setInterval`.

Hook integration points live inline in `src/index.ts` inside both `/v1/chat/completions` and `/v1/messages` handlers — see "Hook integration" below.

## Data model

Single SQLite table `events`:

```sql
CREATE TABLE IF NOT EXISTS events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ts               INTEGER NOT NULL,                       -- unix ms when the request completed
  model            TEXT    NOT NULL,                       -- client-facing model id (e.g. "proxy/deepseek-v4-pro", "haiku")
  brain            TEXT    NOT NULL,                       -- upstream brain (e.g. "deepseek-v4-pro", "mimo-v2.5")
  strategy         TEXT    NOT NULL,                       -- "direct" | "vision" | "vision-mimo" | "mixed" | "local"
  prompt_tokens    INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens     INTEGER NOT NULL DEFAULT 0,
  cost_usd         REAL    NOT NULL DEFAULT 0,             -- computed from registry prices
  latency_ms       INTEGER NOT NULL,                       -- wall-clock from request start to last byte
  status           TEXT    NOT NULL,                       -- "ok" | "error"
  cache_hit        INTEGER NOT NULL DEFAULT 0,             -- 0 | 1 (any cache)
  client           TEXT    NOT NULL                        -- "openai" | "anthropic"
);

CREATE INDEX IF NOT EXISTS idx_events_ts        ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_model_ts  ON events(model, ts);
CREATE INDEX IF NOT EXISTS idx_events_brain_ts  ON events(brain, ts);
CREATE INDEX IF NOT EXISTS idx_events_status_ts ON events(status, ts);
```

Retention sweep (every 1 h):

```sql
DELETE FROM events WHERE ts < ?;        -- ? = now - DASHBOARD_RETENTION_DAYS * 86400000
```

DB path defaults to `data/dashboard.db`; configurable via `DASHBOARD_DB_PATH`.

## Snapshot API

`GET /v1/dashboard/snapshot` returns:

```jsonc
{
  "operational": {
    "version": "3.3.0",
    "uptime_seconds": 12345,
    "mode": "deepseek",
    "providers": { /* getActiveProviderInfo() */ },
    "active_models": ["proxy/deepseek-v4-pro", "proxy/glm-5.2", ...],
    "poll_interval_ms": 10000,         // server tells the client how often to poll
    "log_tail_lines": 200,             // mirror of DASHBOARD_LOG_TAIL_LINES
    "dashboard_enabled": true          // mirrors DASHBOARD_ENABLED
  },
  "metrics": {
    "totals": {
      "prompt_tokens": 12345678,
      "completion_tokens": 2345678,
      "total_tokens": 14691356,
      "cost_usd": 12.34,
      "request_count": 5678,
      "error_count": 12,
      "cache_hits": 234,
      "cache_misses": 5444,
      "cache_ratio": 0.0412
    },
    "last_24h_hourly": [
      { "ts": 1729440000000, "prompt_tokens": ..., "completion_tokens": ..., "total_tokens": ..., "requests": ..., "errors": ..., "cache_hits": ... },
      ... 24 entries (zero-filled)
    ],
    "last_30d_daily": [
      { "ts": 1729123200000, "prompt_tokens": ..., "completion_tokens": ..., "total_tokens": ..., "requests": ..., "errors": ..., "cache_hits": ... },
      ... 30 entries (zero-filled)
    ],
    "by_model": [
      {
        "model": "proxy/deepseek-v4-pro",
        "brain": "deepseek-v4-pro",
        "prompt_tokens": ...,
        "completion_tokens": ...,
        "total_tokens": ...,
        "cost_usd": ...,
        "request_count": ...,
        "error_count": ...,
        "cache_hits": ...,
        "latency_ms": { "p50": ..., "p95": ..., "avg": ... }
      },
      ... sorted by request_count desc
    ],
    "by_brain": [ /* same shape, grouped by brain */ ]
  },
  "recent_logs": [
    { "ts": "2026-07-23 21:00:00", "level": "info", "message": "..." },
    ... up to 200 lines, newest first
  ],
  "cache_stats": { /* existing cacheService.getStats() */ }
}
```

All time-series buckets are produced by SQL `GROUP BY strftime(...)` plus zero-fill in JS for empty buckets. Latency percentiles use SQLite window functions (`NTILE(100)` over `latency_ms` ordered ascending) or — for small windows — collect+sort in JS.

## Hook integration

Capture happens after each request completes. Every capture is wrapped in try/catch so a dashboard write failure never breaks the response.

### `/v1/chat/completions` (non-streaming)

After the existing `await ... .createChatCompletion(...)`:

```ts
dashboardService.recordRequest({
  ts: Date.now(),
  model,
  brain: brainEntry.upstream,
  strategy,
  prompt_tokens: response.usage?.prompt_tokens ?? 0,
  completion_tokens: response.usage?.completion_tokens ?? 0,
  total_tokens: response.usage?.total_tokens ?? 0,
  cost_usd: computeCost(brainEntry, response.usage),
  latency_ms: Date.now() - startTime,
  status: "ok",
  cache_hit: 0,
  client: "openai",
});
```

### `/v1/chat/completions` (streaming)

The completion callback (4th arg of `chatCompletionStream`) already runs at end-of-stream. Capture inside it using the last chunk's `usage` (most OpenAI/Anthropic providers emit usage in the final chunk).

### `/v1/messages` (Anthropic)

Same pattern. Anthropic's `message_delta` event carries `usage`; for streaming, the existing `finalContent` callback runs at end-of-stream.

### Cache hit detection

- For `/v1/messages`, the existing `getCachedAnthropicResponse()` early-return and the in-flight dedupe branch set `cache_hit=1`.
- For descriptions cache, extend `processMultimodalContent` (in `src/middleware/multimodalProcessor.ts`) to return a `descriptions_cache_hits: number` field. If `> 0` OR the Anthropic dedupe branch fired, `cache_hit=1`.

### Error path

In the catch block of both handlers:

```ts
try {
  dashboardService.recordRequest({
    ts: Date.now(), model, brain: brainEntry?.upstream ?? "unknown",
    strategy, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
    cost_usd: 0, latency_ms: Date.now() - startTime,
    status: "error", cache_hit: 0, client: "openai" | "anthropic",
  });
} catch (e) { logger.error("dashboardService.recordRequest failed:", e); }
```

### Cost computation

```ts
function computeCost(brain: BrainModelEntry, usage?: { prompt_tokens: number; completion_tokens: number }): number {
  if (!usage) return 0;
  const inCost  = (usage.prompt_tokens     / 1_000_000) * brain.inputPrice;
  const outCost = (usage.completion_tokens / 1_000_000) * brain.outputPrice;
  return inCost + outCost;
}
```

`inputPrice`/`outputPrice` are USD per 1M tokens (already in `src/services/brainRegistry.ts`).

## Frontend layout

`public/dashboard/index.html` — single page, six sections in order:

1. **Header** — Title "Cortex Proxy Dashboard". Live indicator (green dot) + "last refreshed 12s ago".
2. **Hero cards** (CSS grid, 6 cards on desktop, 2x3 on tablet, 1 col on mobile):
   - Tokens (in / out split)
   - Cost (USD)
   - Requests (with error count sub-line)
   - Error rate (%)
   - Cache ratio (%)
   - Uptime (formatted `Xd Yh`)
3. **Time-series chart** — `chart.js` line chart, last 24h, hourly buckets. Two lines (tokens in / out). Toggle below the chart to switch to 30d daily view.
4. **Models table** — Columns: model · brain · in · out · cost · requests · errors · cache hits · p50 · p95. Sorted by request_count desc. Striped rows, hover highlight.
5. **Log tail** — Pre-formatted scrollable panel with the 200 most recent lines. Level filter dropdown (all / info / warn / error / debug). "Refresh logs" button below the panel.
6. **Footer** — Service version, BRAIN_MODE, providers, last refresh timestamp.

`app.js` — single ES module. On load: `fetchSnapshot()` + render. Then `setInterval(fetchSnapshot, snapshot.operational.poll_interval_ms)`. The server controls the cadence via env var; the client honors it. No framework, no virtual DOM. Handles empty data gracefully (zero-filled cards, "no data" message in charts).

`styles.css` — custom CSS. Theme: dark by default. Monospace for numbers, sans-serif for labels. Restrained color palette (2-3 accents). Aesthetic finalized by `frontend-design` skill at implementation time.

## Configuration

Env vars added to `.env.example`:

```
# Dashboard
DASHBOARD_ENABLED=true                    # default true; if false, skip DB init + hooks
DASHBOARD_RETENTION_DAYS=90               # default 90
DASHBOARD_POLL_INTERVAL_MS=10000          # default 10000 (consumed by client via /v1/dashboard/snapshot)
DASHBOARD_LOG_TAIL_LINES=200              # default 200
DASHBOARD_DB_PATH=./data/dashboard.db     # default ./data/dashboard.db
```

`data/` is added to `.gitignore` (DB and any future artifacts).

## Failure modes

- **SQLite write fails** — Logged at warn level, request continues. Dashboard shows "stale data" indicator but proxy never breaks.
- **SQLite read fails (snapshot)** — Endpoint returns 503 with a clear message. Dashboard renders "data unavailable" banner.
- **DB file corruption on startup** — `dashboardService.init()` catches the open error, renames the bad file to `dashboard.db.broken-<ts>`, and creates a new empty DB.
- **Hook throws** — Every `recordRequest` call is wrapped in try/catch with `logger.error`. Never propagates to the request path.
- **Disk full** — `INSERT` fails with IO error; logged at error and skipped. Same posture as SQLite write failure.
- **`better-sqlite3` native binding fails to load** — Proxy logs a clear error at startup naming the missing platform, then exits with non-zero. Documented in README.

## Out of scope (v1)

- Authentication / authorization on `/dashboard/*`. Same posture as the rest of the proxy today.
- Multi-tenancy / per-user tracking. Single global counter.
- Exporting data (CSV/JSON download).
- Alerts / webhooks on threshold breaches.
- Time-range drill-down beyond 24h and 30d presets.
- Frontend caching or offline support.
- Real-time SSE / WebSocket streaming.
- Rate limiting on `/v1/dashboard/snapshot` (assumed single client).

## Testing approach

- **Unit tests** (vitest) — `dashboardService` (insert, query, retention sweep, edge cases: empty DB, single event, corrupted timestamps), `computeCost`, snapshot query correctness with seeded fixtures.
- **Integration tests** — `GET /v1/dashboard/snapshot` against a test DB with seeded events. Verify JSON shape, totals math, time-series bucket alignment.
- **Hook integration test** — Real `POST /v1/chat/completions` against the proxy with a mocked brain provider; verify the event lands in the DB with the right fields.
- **Frontend** — No JS tests in v1. Manual verification with `npm run dev`.
- **E2E** (`test/test-master.js`, `test/test-claude-code.js`) — Existing flows must still pass. Add a dashboard smoke check that hits `/v1/dashboard/snapshot` and asserts valid JSON.

## Risks and rollback

- **Risk:** Hooking into `/v1/chat/completions` and `/v1/messages` could break existing flows if the capture throws. **Mitigation:** every `recordRequest` is wrapped in try/catch.
- **Risk:** `better-sqlite3` native binding fails on the user's platform (e.g., ARM without prebuilt). **Mitigation:** clear error at startup; documented in README.
- **Risk:** Disk fills up with `dashboard.db` over 90 days. **Mitigation:** sweep runs hourly; bounded size ≈ tens of MB for normal use.
- **Rollback:** set `DASHBOARD_ENABLED=false` and restart. No data is written; the snapshot endpoint returns 503. No DB files touched. Feature is fully reversible by env var.

10. **Per-passthrough cost pricing (added during implementation):** the original spec treated all passthroughs (`mimo-v2.5`, `MiniMax-M3`) as `$0` cost because mimo-v2.5 is subscription-based via OpenCode Go. During implementation this turned out to be wrong for `MiniMax-M3`, which is per-token via `MINIMAX_API_KEY`. Resolution: `resolveBrainServiceEntry` now reads `MINIMAX_INPUT_PRICE` and `MINIMAX_OUTPUT_PRICE` env vars (USD per 1M tokens) for `MiniMax-M3`, defaulting to `0` for backward compat. `mimo-v2.5` stays `0`. The dashboard's cost column reflects whatever the registry entry is.

11. **Cache-hit signal source (added during implementation):** the original spec's cache_hit boolean tracked only the in-memory Anthropic dedupe (`recentAnthropicResponses`). During implementation we discovered MiniMax returns `cache_read_input_tokens` and `cache_creation_input_tokens` in Anthropic-format usage blocks, which indicate upstream prompt-cache hits. The proxy now extracts those fields in `minimaxM3Provider` (both non-streaming and streaming paths) and surfaces them as OpenAI's `prompt_tokens_details.cached_tokens`. `extractUsageFromChunk` reads both formats. Dashboard `cache_hits` counter now covers both Anthropic dedupe AND upstream prompt cache.

## Open questions

None — all scope resolved during brainstorming + implementation addendum.
