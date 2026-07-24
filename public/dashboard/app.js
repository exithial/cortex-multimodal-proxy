const fmt = new Intl.NumberFormat("es-ES");
const fmtCost = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const fmtPct = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

let chart = null;
let chartRange = null;
let lastSnapshot = null;
let lastRefreshAt = 0;
let range = "24h";
let pollTimer = null;
let pollIntervalMs = 0;
let inflight = false;

const els = {
  liveDot: document.getElementById("live-dot"),
  lastRefresh: document.getElementById("last-refresh"),
  pollInterval: document.getElementById("poll-interval"),
  totalTokens: document.getElementById("metric-total-tokens"),
  promptTokens: document.getElementById("metric-prompt-tokens"),
  completionTokens: document.getElementById("metric-completion-tokens"),
  cost: document.getElementById("metric-cost"),
  requests: document.getElementById("metric-requests"),
  requestsOk: document.getElementById("metric-requests-ok"),
  errors: document.getElementById("metric-errors"),
  cacheRatio: document.getElementById("metric-cache-ratio"),
  cacheHits: document.getElementById("metric-cache-hits"),
  cacheMisses: document.getElementById("metric-cache-misses"),
  errorRate: document.getElementById("metric-error-rate"),
  uptime: document.getElementById("metric-uptime"),
  version: document.getElementById("metric-version"),
  modelsTbody: document.getElementById("models-tbody"),
  modelCount: document.getElementById("model-count"),
  logsPane: document.getElementById("logs-pane"),
  logsCount: document.getElementById("logs-count"),
  logLevel: document.getElementById("log-level"),
  logSearch: document.getElementById("log-search"),
  logRefresh: document.getElementById("log-refresh"),
  errorBanner: document.getElementById("error-banner"),
  errorMsg: document.getElementById("error-msg"),
  disabledBanner: document.getElementById("disabled-banner"),
  range24h: document.getElementById("range-24h"),
  range30d: document.getElementById("range-30d"),
  footVersion: document.getElementById("foot-version"),
  footMode: document.getElementById("foot-mode"),
  footProviders: document.getElementById("foot-providers"),
  footRetention: document.getElementById("foot-retention"),
};

function formatUptime(seconds) {
  if (typeof seconds !== "number" || seconds < 0) return "—";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 1) return "0s";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

// Coerce a numeric value to a safe display string. SQLite REAL
// columns can round-trip NaN (becomes NULL) or Infinity through
// better-sqlite3; the dashboard should never show "NaN" or
// "Infinity" as a literal — render as em-dash instead.
function fmtFinite(value, fmtFn) {
  return Number.isFinite(value) ? fmtFn(value) : "—";
}

function renderHero(snap) {
  const t = snap.metrics.totals;
  els.totalTokens.textContent = fmtFinite(t.totalTokens, fmt.format);
  els.promptTokens.textContent = fmtFinite(t.promptTokens, fmt.format);
  els.completionTokens.textContent = fmtFinite(t.completionTokens, fmt.format);
  els.cost.textContent = fmtFinite(t.costUsd, fmtCost.format);
  els.requests.textContent = fmtFinite(t.requestCount, fmt.format);
  els.requestsOk.textContent = fmtFinite(
    t.requestCount - t.errorCount,
    fmt.format,
  );
  els.errors.textContent = fmtFinite(t.errorCount, fmt.format);
  els.cacheRatio.textContent = fmtFinite(
    t.cacheRatio * 100,
    fmtPct.format,
  );
  els.cacheHits.textContent = fmtFinite(t.cacheHits, fmt.format);
  els.cacheMisses.textContent = fmtFinite(t.cacheMisses, fmt.format);
  const errRate =
    t.requestCount > 0 ? (t.errorCount / t.requestCount) * 100 : 0;
  els.errorRate.textContent = fmtFinite(errRate, fmtPct.format);
  els.uptime.textContent = formatUptime(snap.operational.uptimeSeconds);
  els.version.textContent = `v${snap.operational.version}`;
}

function renderChart(snap) {
  if (typeof Chart === "undefined") {
    showChartUnavailable();
    return;
  }
  try {
    const buckets =
      range === "24h" ? snap.metrics.last24hHourly : snap.metrics.last30dDaily;
    const labels = buckets.map((b) => {
      // Server-side buckets are UTC-aligned (see dashboardService.hourlyBuckets
      // which integer-divides Date.now() by bucketMs). Use UTC accessors so
      // the labels match the hour the bucket actually represents regardless
      // of the viewer's local timezone.
      const d = new Date(b.ts);
      if (range === "24h") return `${d.getUTCHours()}h`;
      return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    });
    const inData = buckets.map((b) => b.promptTokens);
    const outData = buckets.map((b) => b.completionTokens);

    // First render, or range switched → build the chart. Otherwise
    // update the data in place so the line does not visually re-mount
    // every 10s (the user reported the chart "rebirthing" on each
    // poll). `chart.update()` with `none` mode skips the animation.
    if (!chart || chartRange !== range) {
      const canvas = document.getElementById("traffic-chart");
      if (!canvas) {
        showChartUnavailable("missing canvas");
        return;
      }
      clearChartUnavailable();
      if (chart) chart.destroy();
      const ctx = canvas.getContext("2d");
      const gridColor = "rgba(241, 234, 215, 0.06)";
      const tickColor = "rgba(241, 234, 215, 0.4)";

      chart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "in",
              data: inData,
              borderColor: "#f0a830",
              backgroundColor: "rgba(240, 168, 48, 0.08)",
              borderWidth: 1.5,
              fill: true,
              tension: 0.35,
              pointRadius: 0,
              pointHoverRadius: 4,
              pointHoverBackgroundColor: "#f0a830",
              pointHoverBorderColor: "#0b0a0e",
              pointHoverBorderWidth: 2,
            },
            {
              label: "out",
              data: outData,
              borderColor: "#4dd4cf",
              backgroundColor: "rgba(77, 212, 207, 0.05)",
              borderWidth: 1.5,
              fill: true,
              tension: 0.35,
              pointRadius: 0,
              pointHoverRadius: 4,
              pointHoverBackgroundColor: "#4dd4cf",
              pointHoverBorderColor: "#0b0a0e",
              pointHoverBorderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: {
            mode: "index",
            intersect: false,
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#14131a",
              borderColor: "#3a3745",
              borderWidth: 1,
              titleColor: "#f1ead7",
              bodyColor: "#b6ad95",
              padding: 12,
              displayColors: true,
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${fmt.format(ctx.parsed.y)}`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: gridColor, drawTicks: false },
              border: { display: false },
              ticks: {
                color: tickColor,
                font: { family: "JetBrains Mono", size: 10 },
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: range === "24h" ? 12 : 10,
              },
            },
            y: {
              grid: { color: gridColor, drawTicks: false },
              border: { display: false },
              ticks: {
                color: tickColor,
                font: { family: "JetBrains Mono", size: 10 },
                callback: (v) => fmt.format(v),
                maxTicksLimit: 5,
              },
            },
          },
        },
      });
      chartRange = range;
    } else {
      // Incremental update: replace labels + dataset values in place
      // and call update() with no animation. This avoids the visual
      // re-mount on each poll.
      chart.data.labels = labels;
      chart.data.datasets[0].data = inData;
      chart.data.datasets[1].data = outData;
      chart.update("none");
    }
  } catch (err) {
    showChartUnavailable(err.message);
  }
}

function showChartUnavailable(reason) {
  const canvas = document.getElementById("traffic-chart");
  if (!canvas) return;
  const wrap = canvas.parentElement;
  if (!wrap) return;
  // Idempotent: remove any prior fallback and re-hide the canvas.
  // Without this, a transient CDN failure sticks the page in the
  // fallback state forever (the canvas stays display:none).
  const existing = wrap.querySelector(".chart-fallback");
  if (existing) existing.remove();
  canvas.style.display = "none";
  const note = document.createElement("div");
  note.className = "chart-fallback";
  note.textContent = reason
    ? `chart no disponible: ${reason}`
    : "chart no disponible (CDN offline?)";
  wrap.appendChild(note);
}

function clearChartUnavailable() {
  const canvas = document.getElementById("traffic-chart");
  if (canvas) canvas.style.display = "";
  const wrap = canvas?.parentElement;
  const note = wrap?.querySelector(".chart-fallback");
  if (note) note.remove();
}

function renderModels(snap) {
  const rows = snap.metrics.byModel;
  els.modelCount.textContent = `${rows.length} ${rows.length === 1 ? "modelo" : "modelos"}`;
  if (rows.length === 0) {
    els.modelsTbody.innerHTML =
      '<tr><td colspan="10" class="empty-row">sin eventos todavia — espera a que llegue el primer request</td></tr>';
    return;
  }
  els.modelsTbody.innerHTML = rows
    .map((m) => {
      const errClass = m.errorCount > 0 ? "col-err" : "";
      const cacheClass = m.cacheHits > 0 ? "col-cache" : "";
      return `<tr>
        <td class="col-model">${escape(m.model)}</td>
        <td class="col-brain">${escape(m.brain)}</td>
        <td class="num">${fmtFinite(m.promptTokens, fmt.format)}</td>
        <td class="num">${fmtFinite(m.completionTokens, fmt.format)}</td>
        <td class="num col-cost">$${fmtFinite(m.costUsd, fmtCost.format)}</td>
        <td class="num">${fmtFinite(m.requestCount, fmt.format)}</td>
        <td class="num ${errClass}">${fmtFinite(m.errorCount, fmt.format)}</td>
        <td class="num ${cacheClass}">${fmtFinite(m.cacheHits, fmt.format)}</td>
        <td class="num">${fmtFinite(m.latencyMs.p50, (v) => `${v}ms`)}</td>
        <td class="num">${fmtFinite(m.latencyMs.p95, (v) => `${v}ms`)}</td>
      </tr>`;
    })
    .join("");
}

function renderLogs(snap) {
  const total = snap.recentLogs.length;
  // Log-level filter dropdown uses synthetic "info+" / "warn+" values
  // for the "include this level and above" UX. The matched log entries
  // only ever carry real levels (info / warn / error / debug / trace);
  // if a structured logger ever emitted a literal "info+" level, the
  // strict switch below falls through to default (no match) instead of
  // accidentally mapping it to "all".
  const VALID_LEVELS = new Set(["all", "info+", "warn+", "error", "debug"]);
  let level = els.logLevel.value;
  if (!VALID_LEVELS.has(level)) level = "all";
  const search = els.logSearch.value.toLowerCase();
  function matchesLevel(l) {
    switch (level) {
      case "all":
        return true;
      case "info+":
        return l.level === "info" || l.level === "warn" || l.level === "error";
      case "warn+":
        return l.level === "warn" || l.level === "error";
      case "error":
      case "debug":
        return l.level === level;
      default:
        // Unknown compound / synthetic level → do NOT match any log
        // entry (in particular do NOT fall through to l.level === level
        // which would treat a literal "info+" log as part of the
        // generic "all" filter).
        return false;
    }
  }
  const filtered = snap.recentLogs.filter(matchesLevel);
  const searched = search
    ? filtered.filter((l) => l.message.toLowerCase().includes(search))
    : filtered;

  const SCROLL_THRESHOLD_PX = 32;
  const pane = els.logsPane;
  if (!pane) return;
  const wasAtBottom =
    pane.scrollTop + pane.clientHeight >= pane.scrollHeight - SCROLL_THRESHOLD_PX;

  if (total === 0) {
    pane.innerHTML =
      '<span class="log-line l-debug">— log vacio (combined.log / error.log) —</span>';
    if (els.logsCount) els.logsCount.textContent = "0 lineas";
    return;
  }
  if (searched.length === 0) {
    pane.innerHTML =
      '<span class="log-line l-debug">— sin logs con ese filtro —</span>';
    if (els.logsCount)
      els.logsCount.textContent = `0 / ${filtered.length} lineas`;
    return;
  }
  const RENDER_LIMIT = 200;
  const slice = searched.slice(0, RENDER_LIMIT);
  pane.innerHTML = slice
    .map((l) => {
      const ts = l.ts || "—";
      return `<span class="log-line l-${escape(l.level)}"><span class="log-ts">${escape(ts)}</span><span class="lvl">${escape(l.level)}</span>${escape(l.message)}</span>`;
    })
    .join("");
  if (wasAtBottom) pane.scrollTop = pane.scrollHeight;
  if (els.logsCount) {
    const shown = slice.length;
    const matched = searched.length;
    els.logsCount.textContent =
      shown < matched
        ? `mostrando ${shown} de ${matched} (filtro)`
        : `${matched} linea${matched === 1 ? "" : "s"}`;
  }
}

function renderFooter(snap) {
  els.footVersion.textContent = `v${snap.operational.version}`;
  els.footMode.textContent = snap.operational.mode || "auto";
  els.footProviders.textContent = JSON.stringify(snap.operational.providers || {});
  els.footRetention.textContent = `${snap.operational.logTailLines} lineas`;
  els.pollInterval.textContent = `${snap.operational.pollIntervalMs / 1000}s`;
}

function render(snap) {
  lastSnapshot = snap;
  lastRefreshAt = Date.now();
  els.liveDot.classList.remove("is-stale");
  els.errorBanner.hidden = true;
  if (!snap.operational.dashboardEnabled) {
    els.disabledBanner.hidden = false;
  } else {
    els.disabledBanner.hidden = true;
  }
  renderHero(snap);
  renderChart(snap);
  renderModels(snap);
  renderLogs(snap);
  renderFooter(snap);
  armPoll(snap.operational.pollIntervalMs);
}

function armPoll(intervalMs) {
  if (pollTimer && pollIntervalMs === intervalMs) return;
  if (pollTimer) clearInterval(pollTimer);
  pollIntervalMs = intervalMs;
  pollTimer = setInterval(() => {
    if (document.hidden || inflight) return;
    fetchSnapshot().catch(() => {});
  }, intervalMs);
}

function tickClock() {
  if (lastRefreshAt > 0) {
    els.lastRefresh.textContent = `hace ${formatAgo(lastRefreshAt)}`;
  }
  const pollMs = lastSnapshot?.operational.pollIntervalMs;
  const staleMs = typeof pollMs === "number" && pollMs > 0 ? pollMs * 3 : 30000;
  if (lastRefreshAt > 0 && Date.now() - lastRefreshAt > staleMs) {
    els.liveDot.classList.add("is-stale");
  }
}

const FIRST_POLL_TIMEOUT_MS = 4000;

async function fetchSnapshot() {
  if (inflight) return;
  inflight = true;
  // Hard timeout = pollIntervalMs * 4 after the first snapshot
  // resolves; FIRST_POLL_TIMEOUT_MS (4s) before that so a hung
  // first request doesn't lock inflight=true for 40s. Without
  // this, a blocked event loop on the server would keep
  // inflight=true, every subsequent poll would early-return, and
  // the dashboard would silently freeze.
  const pollMs =
    (lastSnapshot && lastSnapshot.operational.pollIntervalMs) || null;
  const timeoutMs =
    pollMs !== null ? pollMs * 4 : FIRST_POLL_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/v1/dashboard/snapshot", {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}));
      if (body.error === "dashboard_disabled") {
        els.disabledBanner.hidden = false;
        return;
      }
      throw new Error(body.message || "503");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snap = await res.json();
    render(snap);
  } catch (err) {
    const reason =
      err.name === "AbortError"
        ? `timeout (>${timeoutMs}ms)`
        : err.message || err;
    els.liveDot.classList.add("is-stale");
    els.errorBanner.hidden = false;
    els.errorMsg.textContent = `dashboard: ${reason}`;
  } finally {
    clearTimeout(timeoutId);
    inflight = false;
  }
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

els.range24h.addEventListener("click", () => {
  range = "24h";
  els.range24h.classList.add("is-active");
  els.range30d.classList.remove("is-active");
  if (lastSnapshot) renderChart(lastSnapshot);
});

els.range30d.addEventListener("click", () => {
  range = "30d";
  els.range30d.classList.add("is-active");
  els.range24h.classList.remove("is-active");
  if (lastSnapshot) renderChart(lastSnapshot);
});

els.logLevel.addEventListener("change", () => {
  if (lastSnapshot) renderLogs(lastSnapshot);
});

els.logSearch.addEventListener("input", () => {
  if (lastSnapshot) renderLogs(lastSnapshot);
});

els.logRefresh.addEventListener("click", () => fetchSnapshot());

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) fetchSnapshot().catch(() => {});
});

// Clear the poll timer when the page is hidden for an extended
// period (iframe teardown, SPA navigation, tab moved to a
// background process) so we don't leave a setInterval running
// across navigation. The polling is resumed on the next
// visibilitychange to visible.
window.addEventListener("pagehide", () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});

const missing = Object.entries(els).filter(([, v]) => !v);
if (missing.length > 0) {
  console.error(
    "dashboard: missing elements",
    missing.map(([k]) => k).join(", "),
  );
}

setInterval(tickClock, 1000);
fetchSnapshot().catch(() => {});
