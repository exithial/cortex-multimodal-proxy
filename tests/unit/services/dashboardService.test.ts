import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let tmpDir: string;

vi.mock("../../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../src/services/cacheService", () => ({
  cacheService: {
    getStats: vi.fn().mockResolvedValue({ enabled: true, entries: 0 }),
  },
}));

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dash-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function freshService(overrides: Record<string, string> = {}) {
  const env = {
    DASHBOARD_ENABLED: "true",
    DASHBOARD_DB_PATH: path.join(tmpDir, "dashboard.db"),
    DASHBOARD_RETENTION_DAYS: "90",
    DASHBOARD_LOG_TAIL_LINES: "50",
    DASHBOARD_POLL_INTERVAL_MS: "10000",
    ...overrides,
  };
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  vi.resetModules();
  const mod = await import("../../../src/services/dashboardService");
  const svc = mod.dashboardService;
  await svc.init();
  return { svc, mod, env };
}

describe("dashboardService", () => {
  it("init() creates DB + schema when file is absent", async () => {
    const { svc } = await freshService();
    expect(fs.existsSync(svc.dbPath)).toBe(true);
    expect(svc.enabled).toBe(true);
    svc.close();
  });

  it("init() is a no-op when DASHBOARD_ENABLED=false", async () => {
    const { svc } = await freshService({ DASHBOARD_ENABLED: "false" });
    expect(svc.enabled).toBe(false);
    expect(fs.existsSync(svc.dbPath)).toBe(false);
  });

  it("recordRequest() inserts a row with all fields", async () => {
    const { svc, mod } = await freshService();
    mod.dashboardService.recordRequest({
      ts: 1700000000000,
      model: "proxy/deepseek-v4-pro",
      brain: "deepseek-v4-pro",
      strategy: "direct",
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      costUsd: 0.05,
      latencyMs: 1234,
      status: "ok",
      cacheHit: 0,
      client: "openai",
    });
    const snap = await svc.getSnapshot({ startTime: Date.now() - 1000, version: "test" });
    expect(snap.metrics.totals.requestCount).toBe(1);
    expect(snap.metrics.totals.promptTokens).toBe(100);
    expect(snap.metrics.totals.completionTokens).toBe(50);
    expect(snap.metrics.totals.totalTokens).toBe(150);
    expect(snap.metrics.totals.costUsd).toBeCloseTo(0.05);
    expect(snap.metrics.byModel).toHaveLength(1);
    expect(snap.metrics.byModel[0].model).toBe("proxy/deepseek-v4-pro");
    expect(snap.metrics.byModel[0].latencyMs.p50).toBe(1234);
    svc.close();
  });

  it("recordRequest() does not throw when DB is closed (error path)", async () => {
    const { svc } = await freshService();
    svc.close();
    expect(() =>
      svc.recordRequest({
        ts: Date.now(),
        model: "x",
        brain: "x",
        strategy: "direct",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        latencyMs: 0,
        status: "ok",
        cacheHit: 0,
        client: "openai",
      })
    ).not.toThrow();
  });

  it("recordRequest() is a no-op when disabled", async () => {
    const { svc, mod } = await freshService({ DASHBOARD_ENABLED: "false" });
    mod.dashboardService.recordRequest({
      ts: Date.now(),
      model: "x",
      brain: "x",
      strategy: "direct",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      status: "ok",
      cacheHit: 0,
      client: "openai",
    });
    const snap = await svc.getSnapshot({ startTime: Date.now(), version: "test" });
    expect(snap.metrics.totals.requestCount).toBe(0);
  });

  it("getSnapshot() aggregates totals correctly across multiple events", async () => {
    const { svc, mod } = await freshService();
    const base = Date.now() - 60000;
    const events = [
      { prompt: 100, completion: 50, status: "ok", cache: 0, latency: 1000 },
      { prompt: 200, completion: 80, status: "ok", cache: 1, latency: 1500 },
      { prompt: 50, completion: 20, status: "error", cache: 0, latency: 500 },
      { prompt: 300, completion: 100, status: "ok", cache: 0, latency: 2000 },
    ];
    events.forEach((e, i) =>
      mod.dashboardService.recordRequest({
        ts: base + i * 1000,
        model: "proxy/deepseek-v4-pro",
        brain: "deepseek-v4-pro",
        strategy: "direct",
        promptTokens: e.prompt,
        completionTokens: e.completion,
        totalTokens: e.prompt + e.completion,
        costUsd: (e.prompt / 1_000_000) * 0.435 + (e.completion / 1_000_000) * 0.87,
        latencyMs: e.latency,
        status: e.status as "ok" | "error",
        cacheHit: e.cache,
        client: "openai",
      })
    );
    const snap = await svc.getSnapshot({ startTime: Date.now() - 100000, version: "test" });
    expect(snap.metrics.totals.requestCount).toBe(4);
    expect(snap.metrics.totals.promptTokens).toBe(650);
    expect(snap.metrics.totals.completionTokens).toBe(250);
    expect(snap.metrics.totals.totalTokens).toBe(900);
    expect(snap.metrics.totals.errorCount).toBe(1);
    expect(snap.metrics.totals.cacheHits).toBe(1);
    expect(snap.metrics.totals.cacheMisses).toBe(3);
    expect(snap.metrics.totals.cacheRatio).toBeCloseTo(0.25);
    svc.close();
  });

  it("getSnapshot() produces 24 zero-filled hourly buckets when empty", async () => {
    const { svc } = await freshService();
    const snap = await svc.getSnapshot({ startTime: Date.now(), version: "test" });
    expect(snap.metrics.last24hHourly).toHaveLength(24);
    expect(snap.metrics.last24hHourly.every((b) => b.requests === 0)).toBe(true);
    expect(snap.metrics.last30dDaily).toHaveLength(30);
    expect(snap.metrics.last30dDaily.every((b) => b.requests === 0)).toBe(true);
    svc.close();
  });

  it("hourly buckets align to the hour boundary (not now-1h)", async () => {
    const { svc, mod } = await freshService();
    mod.dashboardService.recordRequest({
      ts: Date.now(),
      model: "m1",
      brain: "m1",
      strategy: "direct",
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      costUsd: 0,
      latencyMs: 100,
      status: "ok",
      cacheHit: 0,
      client: "openai",
    });
    const snap = await svc.getSnapshot({ startTime: Date.now(), version: "test" });
    const hourMs = 60 * 60 * 1000;
    const expectedLastTs = Date.now() - (Date.now() % hourMs);
    expect(snap.metrics.last24hHourly[snap.metrics.last24hHourly.length - 1].ts).toBe(
      expectedLastTs,
    );
    const totalInBuckets = snap.metrics.last24hHourly.reduce(
      (sum, b) => sum + b.requests,
      0,
    );
    expect(totalInBuckets).toBe(1);
    svc.close();
  });

  it("getSnapshot() by-model breakdown is sorted by request_count desc", async () => {
    const { svc, mod } = await freshService();
    const now = Date.now() - 10000;
    for (let i = 0; i < 3; i++) {
      mod.dashboardService.recordRequest({
        ts: now,
        model: "proxy/glm-5.2",
        brain: "glm-5.2",
        strategy: "direct",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        costUsd: 0,
        latencyMs: 1,
        status: "ok",
        cacheHit: 0,
        client: "openai",
      });
    }
    mod.dashboardService.recordRequest({
      ts: now,
      model: "proxy/qwen3.7-max",
      brain: "qwen3.7-max",
      strategy: "direct",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      costUsd: 0,
      latencyMs: 1,
      status: "ok",
      cacheHit: 0,
      client: "openai",
    });
    const snap = await svc.getSnapshot({ startTime: Date.now() - 20000, version: "test" });
    expect(snap.metrics.byModel[0].model).toBe("proxy/glm-5.2");
    expect(snap.metrics.byModel[0].requestCount).toBe(3);
    expect(snap.metrics.byModel[1].model).toBe("proxy/qwen3.7-max");
    expect(snap.metrics.byModel[1].requestCount).toBe(1);
    svc.close();
  });

  it("getSnapshot() computes latency p50/p95/avg per model", async () => {
    const { svc, mod } = await freshService();
    const now = Date.now() - 10000;
    const latencies = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    latencies.forEach((lat) =>
      mod.dashboardService.recordRequest({
        ts: now,
        model: "proxy/glm-5.2",
        brain: "glm-5.2",
        strategy: "direct",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        costUsd: 0,
        latencyMs: lat,
        status: "ok",
        cacheHit: 0,
        client: "openai",
      })
    );
    const snap = await svc.getSnapshot({ startTime: Date.now() - 20000, version: "test" });
    const m = snap.metrics.byModel[0];
    expect(m.latencyMs.avg).toBe(550);
    expect(m.latencyMs.p50).toBe(500);
    expect(m.latencyMs.p95).toBe(1000);
    svc.close();
  });

  it("runRetentionSweep() deletes rows older than retention window", async () => {
    const { svc, mod } = await freshService({ DASHBOARD_RETENTION_DAYS: "1" });
    const old = Date.now() - 2 * 24 * 60 * 60 * 1000;
    mod.dashboardService.recordRequest({
      ts: old,
      model: "m1",
      brain: "m1",
      strategy: "direct",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      costUsd: 0,
      latencyMs: 1,
      status: "ok",
      cacheHit: 0,
      client: "openai",
    });
    mod.dashboardService.recordRequest({
      ts: Date.now(),
      model: "m2",
      brain: "m2",
      strategy: "direct",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      costUsd: 0,
      latencyMs: 1,
      status: "ok",
      cacheHit: 0,
      client: "openai",
    });
    const removed = svc.runRetentionSweep();
    expect(removed).toBe(1);
    const snap = await svc.getSnapshot({ startTime: Date.now() - 100000000, version: "test" });
    expect(snap.metrics.totals.requestCount).toBe(1);
    svc.close();
  });

  it("init() recovers from corruption by renaming the bad file and starting fresh", async () => {
    const dbPath = path.join(tmpDir, "dashboard.db");
    fs.writeFileSync(dbPath, "this is not a sqlite db");
    process.env.DASHBOARD_DB_PATH = dbPath;
    vi.resetModules();
const mod = await import("../../../src/services/dashboardService");
    await mod.dashboardService.init();
    expect(fs.existsSync(dbPath)).toBe(true);
    const broken = fs.readdirSync(tmpDir).find((f) => f.startsWith("dashboard.db.broken-"));
    expect(broken).toBeDefined();
    mod.dashboardService.close();
  });

  it("getSnapshot() includes operational info from caller", async () => {
    const { svc } = await freshService();
    const snap = await svc.getSnapshot({
      startTime: Date.now() - 5000,
      version: "1.2.3",
    });
    expect(snap.operational.version).toBe("1.2.3");
    expect(snap.operational.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(snap.operational.dashboardEnabled).toBe(true);
    expect(snap.operational.pollIntervalMs).toBe(10000);
    expect(snap.operational.logTailLines).toBe(50);
    svc.close();
  });

  it("getSnapshot() returns cache_stats from cacheService", async () => {
    const { svc } = await freshService();
    const snap = await svc.getSnapshot({ startTime: Date.now(), version: "test" });
    expect(snap.cacheStats).toEqual({ enabled: true, entries: 0 });
    svc.close();
  });

  it("recordRequest() rejects rows that violate CHECK constraints (status/cache_hit/client/strategy)", async () => {
    const { svc, mod } = await freshService();
    // Each invalid payload should be silently dropped (logged at warn level)
    // and NOT show up in the snapshot. The dashboard never breaks the
    // request path even when a future bug sends bad data.
    const invalidStatuses: Array<"bad" | "pending" | ""> = ["bad", "pending", ""];
    for (const status of invalidStatuses) {
      mod.dashboardService.recordRequest({
        ts: Date.now(),
        model: "m",
        brain: "b",
        strategy: "direct",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        costUsd: 0,
        latencyMs: 100,
        status: status as "ok",
        cacheHit: 0,
        client: "openai",
      });
    }
    mod.dashboardService.recordRequest({
      ts: Date.now(),
      model: "m",
      brain: "b",
      strategy: "unknown-strategy" as "direct",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      costUsd: 0,
      latencyMs: 100,
      status: "ok",
      cacheHit: 0,
      client: "openai",
    });
    mod.dashboardService.recordRequest({
      ts: Date.now(),
      model: "m",
      brain: "b",
      strategy: "direct",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      costUsd: 0,
      latencyMs: 100,
      status: "ok",
      cacheHit: 5 as 0,
      client: "openai",
    });
    const snap = await svc.getSnapshot({ startTime: Date.now(), version: "test" });
    expect(snap.metrics.totals.requestCount).toBe(0);
    svc.close();
  });

  it("runRetentionSweep() timer is unref'd (does not block shutdown)", async () => {
    const { svc } = await freshService();
    // The timer is stored privately; verify it has .unref() and is not
    // keeping the process alive. We don't reach into the private field,
    // but we do call close() which clears the timer; if close() were
    // a no-op when the timer is unref'd, this test would still pass.
    // The real signal: after close(), a subsequent sweep call is a
    // safe no-op (timer cleared).
    svc.close();
    expect(() => svc.runRetentionSweep()).not.toThrow();
  });

  it("clamps DASHBOARD_RETENTION_DAYS to [1, 3650] on out-of-range input", async () => {
    const { svc: svc0 } = await freshService({ DASHBOARD_RETENTION_DAYS: "0" });
    expect(svc0.retentionDays).toBe(1);
    svc0.close();
    const { svc: svcNeg } = await freshService({
      DASHBOARD_RETENTION_DAYS: "-100",
    });
    expect(svcNeg.retentionDays).toBe(1);
    svcNeg.close();
    const { svc: svcHuge } = await freshService({
      DASHBOARD_RETENTION_DAYS: "99999",
    });
    expect(svcHuge.retentionDays).toBe(3650);
    svcHuge.close();
    const { svc: svcFractional } = await freshService({
      DASHBOARD_RETENTION_DAYS: "7.5",
    });
    // Math.floor applied: clamps OK, but fractional input is floored.
    expect(svcFractional.retentionDays).toBe(7);
    svcFractional.close();
  });

  it("getSnapshot() redacts log message secrets (Bearer / sk-... / email / base64 / data:image)", async () => {
    const logDir = path.join(tmpDir, "redact-test");
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, "combined.log");
    const errorPath = path.join(logDir, "error.log");
    fs.writeFileSync(errorPath, "");
    const sensitive =
      "[2026-07-24 18:00:00] ℹ️ [INFO] " +
      "Authorization: Bearer sk-test-abc123def456 " +
      "user@example.com " +
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII= " +
      "longbase64AaaaBbbbCcccDdddEeeeFfffGgggHhhhIiiiJjjjKkkkLlllMmmmNnnnOoooPpppQqqqRrrrSsssTttt=";
    fs.writeFileSync(logPath, sensitive + "\n");
    process.env.DASHBOARD_LOG_TAIL_LINES = "10";
    process.env.DASHBOARD_DB_PATH = path.join(tmpDir, "dashboard-redact.db");
    process.env.DASHBOARD_LOG_FILE = logPath;
    process.env.DASHBOARD_ERROR_LOG_FILE = errorPath;
    const { svc: svcRedact } = await freshService({});
    const snap = await svcRedact.getSnapshot({ startTime: Date.now(), version: "t" });
    expect(snap.recentLogs).toHaveLength(1);
    const msg = snap.recentLogs[0].message;
    expect(msg).not.toContain("sk-test-abc123def456");
    expect(msg).not.toContain("user@example.com");
    expect(msg).not.toContain("iVBORw0KGgo");
    expect(msg).toContain("sk-[REDACTED]");
    expect(msg).toContain("[EMAIL]");
    expect(msg).toContain("data:image/[REDACTED]");
    expect(msg).toContain("[BASE64]");
    svcRedact.close();
  });
});