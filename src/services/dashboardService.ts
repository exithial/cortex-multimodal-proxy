import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { logger } from "../utils/logger";
import { getErrorMessage } from "../utils/error";
import { cacheService } from "./cacheService";
import packageJson from "../../package.json";

export type Strategy =
  | "direct"
  | "vision"
  | "vision-mimo"
  | "mixed"
  | "local";
export type ClientKind = "openai" | "anthropic";
export type StatusKind = "ok" | "error";

export interface RecordRequestPayload {
  ts: number;
  model: string;
  brain: string;
  strategy: Strategy;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
  status: StatusKind;
  cacheHit: 0 | 1;
  client: ClientKind;
}

export interface HourBucket {
  ts: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
  errors: number;
  cacheHits: number;
}

export interface LatencySummary {
  p50: number;
  p95: number;
  avg: number;
}

export interface ModelBreakdown {
  model: string;
  brain: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
  errorCount: number;
  cacheHits: number;
  latencyMs: LatencySummary;
}

export interface MetricsSnapshot {
  totals: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    requestCount: number;
    errorCount: number;
    cacheHits: number;
    cacheMisses: number;
    cacheRatio: number;
  };
  last24hHourly: HourBucket[];
  last30dDaily: HourBucket[];
  byModel: ModelBreakdown[];
  byBrain: ModelBreakdown[];
}

export interface LogLine {
  ts: string;
  level: string;
  message: string;
}

export interface OperationalInfo {
  version: string;
  uptimeSeconds: number;
  mode: string;
  providers: unknown;
  activeModels: string[];
  pollIntervalMs: number;
  logTailLines: number;
  dashboardEnabled: boolean;
}

export interface DashboardSnapshot {
  operational: OperationalInfo;
  metrics: MetricsSnapshot;
  recentLogs: LogLine[];
  cacheStats: unknown;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ts                INTEGER NOT NULL,
  model             TEXT    NOT NULL,
  brain             TEXT    NOT NULL,
  strategy          TEXT    NOT NULL
                              CHECK (strategy IN ('direct','vision','vision-mimo','mixed','local')),
  prompt_tokens     INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens      INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  cost_usd          REAL    NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  latency_ms        INTEGER NOT NULL CHECK (latency_ms >= 0),
  status            TEXT    NOT NULL CHECK (status IN ('ok','error')),
  cache_hit         INTEGER NOT NULL DEFAULT 0 CHECK (cache_hit IN (0,1)),
  client            TEXT    NOT NULL CHECK (client IN ('openai','anthropic'))
);
CREATE INDEX IF NOT EXISTS idx_events_ts        ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_model_ts  ON events(model, ts);
CREATE INDEX IF NOT EXISTS idx_events_brain_ts  ON events(brain, ts);
CREATE INDEX IF NOT EXISTS idx_events_status_ts ON events(status, ts);
`;

class DashboardService {
  readonly enabled: boolean;
  readonly dbPath: string;
  readonly retentionDays: number;
  readonly logTailLines: number;
  readonly pollIntervalMs: number;
  private db: DatabaseType | null = null;
  private retentionTimer: NodeJS.Timeout | null = null;
  private insertStmt: ReturnType<DatabaseType["prepare"]> | null = null;
  private logFilePath = path.resolve(
    process.env.DASHBOARD_LOG_FILE || "./combined.log",
  );
  private errorLogPath = path.resolve(
    process.env.DASHBOARD_ERROR_LOG_FILE || "./error.log",
  );

  constructor() {
    this.enabled = process.env.DASHBOARD_ENABLED !== "false";
    this.dbPath = path.resolve(
      process.env.DASHBOARD_DB_PATH || "./data/dashboard.db",
    );
    this.retentionDays = this.clampRetentionDays(
      parseInt(process.env.DASHBOARD_RETENTION_DAYS || "90"),
    );
    this.logTailLines = parseInt(process.env.DASHBOARD_LOG_TAIL_LINES || "200");
    this.pollIntervalMs = parseInt(
      process.env.DASHBOARD_POLL_INTERVAL_MS || "10000",
    );
  }

  async init(): Promise<void> {
    if (!this.enabled) {
      logger.info("Dashboard deshabilitado (DASHBOARD_ENABLED=false)");
      return;
    }
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = this.openOrRecreate();
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(SCHEMA);
    this.insertStmt = this.db.prepare(
      `INSERT INTO events (ts, model, brain, strategy, prompt_tokens, completion_tokens,
         total_tokens, cost_usd, latency_ms, status, cache_hit, client)
       VALUES (@ts, @model, @brain, @strategy, @promptTokens, @completionTokens,
         @totalTokens, @costUsd, @latencyMs, @status, @cacheHit, @client)`,
    );
    logger.info(`Dashboard DB lista: ${this.dbPath} (retencion ${this.retentionDays}d)`);
    this.scheduleRetentionSweep();
  }

  private openOrRecreate(): DatabaseType {
    try {
      const db = new Database(this.dbPath);
      try {
        db.prepare("SELECT 1").get();
        return db;
      } catch (probeErr) {
        try {
          db.close();
        } catch {
          // ignore
        }
        throw probeErr;
      }
    } catch (err) {
      logger.warn(
        `Dashboard DB corrupta o ilegible; renombrando y recreando: ${getErrorMessage(err)}`,
      );
      try {
        fs.renameSync(this.dbPath, `${this.dbPath}.broken-${Date.now()}`);
      } catch (renameErr) {
        logger.error(
          `No se pudo renombrar la DB rota: ${getErrorMessage(renameErr)}`,
        );
      }
      return new Database(this.dbPath);
    }
  }

  private clampRetentionDays(value: number): number {
    if (!Number.isFinite(value) || value < 1) {
      logger.warn(
        `DASHBOARD_RETENTION_DAYS="${process.env.DASHBOARD_RETENTION_DAYS}" is invalid; clamping to 1 day`,
      );
      return 1;
    }
    if (value > 3650) {
      logger.warn(
        `DASHBOARD_RETENTION_DAYS=${value} is over 10 years; clamping to 3650`,
      );
      return 3650;
    }
    return Math.floor(value);
  }

  private scheduleRetentionSweep(): void {
    const tick = () => {
      try {
        const removed = this.runRetentionSweep();
        if (removed > 0) {
          logger.info(`Dashboard sweep: ${removed} eventos purgados`);
        }
      } catch (err) {
        logger.warn(`Dashboard sweep fallo: ${getErrorMessage(err)}`);
      }
    };
    this.retentionTimer = setInterval(tick, 60 * 60 * 1000);
    this.retentionTimer.unref();
  }

  runRetentionSweep(): number {
    if (!this.db || !this.enabled) return 0;
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    const result = this.db.prepare(`DELETE FROM events WHERE ts < ?`).run(cutoff);
    return Number(result.changes) || 0;
  }

  recordRequest(payload: RecordRequestPayload): void {
    if (!this.enabled || !this.db || !this.insertStmt) return;
    try {
      this.insertStmt.run(payload);
    } catch (err) {
      logger.warn(
        `dashboardService.recordRequest fallo: ${getErrorMessage(err)}`,
      );
    }
  }

  async getSnapshot(args: {
    startTime: number;
    version: string;
    mode?: string;
    providers?: unknown;
    activeModels?: string[];
  }): Promise<DashboardSnapshot> {
    const operational: OperationalInfo = {
      version: args.version,
      uptimeSeconds: Math.max(0, Math.floor((Date.now() - args.startTime) / 1000)),
      mode: args.mode || (process.env.BRAIN_MODE || "auto"),
      providers: args.providers ?? null,
      activeModels: args.activeModels ?? [],
      pollIntervalMs: this.pollIntervalMs,
      logTailLines: this.logTailLines,
      dashboardEnabled: this.enabled,
    };

    if (!this.db || !this.enabled) {
      return {
        operational,
        metrics: this.emptyMetrics(),
        recentLogs: [],
        cacheStats: await this.safeCacheStats(),
      };
    }

    try {
      const totals = this.totalsRow();
      const metrics: MetricsSnapshot = {
        totals: {
          promptTokens: totals.promptTokens,
          completionTokens: totals.completionTokens,
          totalTokens: totals.totalTokens,
          costUsd: totals.costUsd,
          requestCount: totals.requestCount,
          errorCount: totals.errorCount,
          cacheHits: totals.cacheHits,
          cacheMisses: Math.max(0, totals.requestCount - totals.cacheHits),
          cacheRatio:
            totals.requestCount > 0 ? totals.cacheHits / totals.requestCount : 0,
        },
        last24hHourly: this.hourlyBuckets(24, 60 * 60 * 1000),
        last30dDaily: this.hourlyBuckets(30, 24 * 60 * 60 * 1000),
        byModel: this.breakdown("model"),
        byBrain: this.breakdown("brain"),
      };
      return {
        operational,
        metrics,
        recentLogs: this.readRecentLogs(),
        cacheStats: await this.safeCacheStats(),
      };
    } catch (err) {
      logger.warn(`Dashboard snapshot fallo: ${getErrorMessage(err)}`);
      return {
        operational,
        metrics: this.emptyMetrics(),
        recentLogs: [],
        cacheStats: await this.safeCacheStats(),
      };
    }
  }

  private totalsRow(): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    requestCount: number;
    errorCount: number;
    cacheHits: number;
  } {
    const row = this.db!
      .prepare(
        `SELECT
           COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
           COALESCE(SUM(completion_tokens), 0) AS completionTokens,
           COALESCE(SUM(total_tokens), 0) AS totalTokens,
           COALESCE(SUM(cost_usd), 0) AS costUsd,
           COUNT(*) AS requestCount,
           COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errorCount,
           COALESCE(SUM(cache_hit), 0) AS cacheHits
         FROM events`,
      )
      .get() as {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUsd: number;
      requestCount: number;
      errorCount: number;
      cacheHits: number;
    };
    return row;
  }

  private hourlyBuckets(count: number, bucketMs: number): HourBucket[] {
    const now = Date.now();
    const currentBucketStart = now - (now % bucketMs);
    const buckets: HourBucket[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const start = currentBucketStart - i * bucketMs;
      buckets.push({
        ts: start,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        requests: 0,
        errors: 0,
        cacheHits: 0,
      });
    }
    const cutoff = now - count * bucketMs;
    const rows = this.db!
      .prepare(
        `SELECT
           CAST(ts / ? AS INTEGER) * ? AS bucketTs,
           COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
           COALESCE(SUM(completion_tokens), 0) AS completionTokens,
           COALESCE(SUM(total_tokens), 0) AS totalTokens,
           COUNT(*) AS requests,
           COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errors,
           COALESCE(SUM(cache_hit), 0) AS cacheHits
         FROM events
         WHERE ts >= ?
         GROUP BY bucketTs`,
      )
      .all(bucketMs, bucketMs, cutoff) as Array<{
      bucketTs: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      requests: number;
      errors: number;
      cacheHits: number;
    }>;
    const byTs = new Map<number, (typeof rows)[number]>();
    for (const r of rows) byTs.set(r.bucketTs, r);
    return buckets.map((b) => {
      const r = byTs.get(b.ts);
      if (!r) return b;
      return {
        ts: b.ts,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        totalTokens: r.totalTokens,
        requests: r.requests,
        errors: r.errors,
        cacheHits: r.cacheHits,
      };
    });
  }

  private breakdown(groupBy: "model" | "brain"): ModelBreakdown[] {
    const cols =
      groupBy === "model"
        ? `model AS model, brain AS brain`
        : `brain AS model, brain AS brain`;
    const rows = this.db!
      .prepare(
        `SELECT ${cols},
           COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
           COALESCE(SUM(completion_tokens), 0) AS completionTokens,
           COALESCE(SUM(total_tokens), 0) AS totalTokens,
           COALESCE(SUM(cost_usd), 0) AS costUsd,
           COUNT(*) AS requestCount,
           COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errorCount,
           COALESCE(SUM(cache_hit), 0) AS cacheHits
         FROM events
         GROUP BY model, brain
         ORDER BY requestCount DESC`,
      )
      .all() as Array<{
      model: string;
      brain: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUsd: number;
      requestCount: number;
      errorCount: number;
      cacheHits: number;
    }>;
    return rows.map((r) => ({
      ...r,
      latencyMs: this.latencyPercentiles(r.model, r.brain),
    }));
  }

  private latencyPercentiles(
    groupValue: string,
    brain: string,
  ): LatencySummary {
    const rows = this.db!
      .prepare(
        `SELECT latency_ms AS latencyMs FROM events
         WHERE model = ? AND brain = ?
         ORDER BY latency_ms ASC`,
      )
      .all(groupValue, brain) as Array<{ latencyMs: number }>;
    if (rows.length === 0) return { p50: 0, p95: 0, avg: 0 };
    const lats = rows.map((r) => r.latencyMs);
    const sum = lats.reduce((a, b) => a + b, 0);
    const pick = (p: number) =>
      lats[Math.min(lats.length - 1, Math.ceil((p / 100) * lats.length) - 1)] ??
      lats[lats.length - 1];
    return {
      p50: pick(50),
      p95: pick(95),
      avg: Math.round(sum / lats.length),
    };
  }

  private emptyMetrics(): MetricsSnapshot {
    const zeroBucket: HourBucket = {
      ts: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
      errors: 0,
      cacheHits: 0,
    };
    return {
      totals: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        requestCount: 0,
        errorCount: 0,
        cacheHits: 0,
        cacheMisses: 0,
        cacheRatio: 0,
      },
      last24hHourly: Array(24).fill(zeroBucket).map((_, i) => ({ ...zeroBucket, ts: Date.now() - (24 - i) * 3_600_000 })),
      last30dDaily: Array(30).fill(zeroBucket).map((_, i) => ({ ...zeroBucket, ts: Date.now() - (30 - i) * 86_400_000 })),
      byModel: [],
      byBrain: [],
    };
  }

  /**
   * Redact obvious PII / secrets from log message lines before they
   * reach the unauthenticated `/v1/dashboard/snapshot` endpoint.
   * The proxy's logger prints request bodies, axios error stacks,
   * base64 image data, and (occasionally) full curl commands with
   * auth headers — none of which should leak via the dashboard.
   * Patterns covered:
   *  - `Bearer <token>` → `Bearer [REDACTED]`
   *  - `sk-...` Anthropic/OpenAI/MiniMax API keys
   *  - email addresses
   *  - long base64-looking blobs (>= 64 chars of [A-Za-z0-9+/=])
   *  - data:image/<...>;base64,<...> URIs (whole URI replaced)
   */
  private redactLogMessage(line: string): string {
    return line
      // Order matters: data:image URIs first (greedy base64 regex
      // would otherwise partially eat the URI before the URI regex
      // could match the whole thing).
      .replace(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g,
        "data:image/[REDACTED]")
      .replace(/(?:Bearer|x-api-key|api[_-]?key)["':= ]+["']?([A-Za-z0-9._\-+/=]{8,})["']?/gi,
        "$1 [REDACTED]")
      .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "sk-[REDACTED]")
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]")
      .replace(/(?:[A-Za-z0-9+/]{4}){16,}={0,2}/g, (m) =>
        m.length >= 64 ? "[BASE64]" : m,
      );
  }

  private readRecentLogs(): LogLine[] {
    const lines: LogLine[] = [];
    const sources = [this.logFilePath, this.errorLogPath];
    for (const file of sources) {
      try {
        const raw = fs.readFileSync(file, "utf-8");
        const tail = raw.split("\n").slice(-this.logTailLines).filter(Boolean);
        for (const line of tail) {
          const m = line.match(/^\[([^\]]+)\]\s+\S+\s+\[([^\]]+)\]\s+(.*)$/);
          if (m) {
            lines.push({
              ts: m[1],
              level: m[2].toLowerCase(),
              message: this.redactLogMessage(m[3]),
            });
          } else {
            lines.push({
              ts: "",
              level: "info",
              message: this.redactLogMessage(line),
            });
          }
        }
      } catch {
        // file may not exist yet — skip silently
      }
    }
    lines.sort((a, b) => (b.ts > a.ts ? 1 : b.ts < a.ts ? -1 : 0));
    return lines.slice(0, this.logTailLines);
  }

  private async safeCacheStats(): Promise<unknown> {
    try {
      return await cacheService.getStats();
    } catch (err) {
      logger.debug(`cacheService.getStats fallo: ${getErrorMessage(err)}`);
      return { enabled: false, error: getErrorMessage(err) };
    }
  }

  close(): void {
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // ignore
      }
      this.db = null;
      this.insertStmt = null;
    }
  }
}

export const dashboardService = new DashboardService();

export const DASHBOARD_VERSION = packageJson.version;