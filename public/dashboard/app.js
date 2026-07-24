const fmt = new Intl.NumberFormat("es-ES");
const fmtCost = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const fmtPct = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

let chart = null;
let lastSnapshot = null;
let lastRefreshAt = 0;
let range = "24h";

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
  if (!seconds || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 5) return "ahora";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function renderHero(snap) {
  const t = snap.metrics.totals;
  els.totalTokens.textContent = fmt.format(t.totalTokens);
  els.promptTokens.textContent = fmt.format(t.promptTokens);
  els.completionTokens.textContent = fmt.format(t.completionTokens);
  els.cost.textContent = fmtCost.format(t.costUsd);
  els.requests.textContent = fmt.format(t.requestCount);
  els.requestsOk.textContent = fmt.format(t.requestCount - t.errorCount);
  els.errors.textContent = fmt.format(t.errorCount);
  els.cacheRatio.textContent = fmtPct.format(t.cacheRatio * 100);
  els.cacheHits.textContent = fmt.format(t.cacheHits);
  els.cacheMisses.textContent = fmt.format(t.cacheMisses);
  const errRate = t.requestCount > 0 ? (t.errorCount / t.requestCount) * 100 : 0;
  els.errorRate.textContent = fmtPct.format(errRate);
  els.uptime.textContent = formatUptime(snap.operational.uptimeSeconds);
  els.version.textContent = `v${snap.operational.version}`;
}

function renderChart(snap) {
  const buckets =
    range === "24h" ? snap.metrics.last24hHourly : snap.metrics.last30dDaily;
  const labels = buckets.map((b) => {
    const d = new Date(b.ts);
    if (range === "24h") return `${d.getHours()}h`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  const inData = buckets.map((b) => b.promptTokens);
  const outData = buckets.map((b) => b.completionTokens);

  const ctx = document.getElementById("traffic-chart").getContext("2d");
  if (chart) chart.destroy();
  const isDark = getComputedStyle(document.documentElement)
    .getPropertyValue("--bg")
    .trim();
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
        <td class="num">${fmt.format(m.promptTokens)}</td>
        <td class="num">${fmt.format(m.completionTokens)}</td>
        <td class="num col-cost">$${fmtCost.format(m.costUsd)}</td>
        <td class="num">${fmt.format(m.requestCount)}</td>
        <td class="num ${errClass}">${fmt.format(m.errorCount)}</td>
        <td class="num ${cacheClass}">${fmt.format(m.cacheHits)}</td>
        <td class="num">${m.latencyMs.p50}ms</td>
        <td class="num">${m.latencyMs.p95}ms</td>
      </tr>`;
    })
    .join("");
}

function renderLogs(snap) {
  const level = els.logLevel.value;
  const search = els.logSearch.value.toLowerCase();
  const filtered = snap.recentLogs.filter((l) => {
    if (level === "all") return true;
    if (level === "warn") return l.level === "warn" || l.level === "error";
    if (level === "info")
      return ["info", "warn", "error"].includes(l.level);
    return l.level === level;
  });
  const searched = search
    ? filtered.filter((l) => l.message.toLowerCase().includes(search))
    : filtered;
  if (searched.length === 0) {
    els.logsPane.innerHTML = '<span class="log-line l-debug">— sin logs con ese filtro —</span>';
    return;
  }
  els.logsPane.innerHTML = searched
    .slice(0, 200)
    .map((l) => {
      const ts = l.ts || "—";
      return `<span class="log-line l-${escape(l.level)}"><span class="log-ts">${escape(ts)}</span><span class="lvl">${escape(l.level)}</span>${escape(l.message)}</span>`;
    })
    .join("");
  els.logsPane.scrollTop = els.logsPane.scrollHeight;
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
}

function tickClock() {
  if (lastRefreshAt > 0) {
    els.lastRefresh.textContent = `hace ${formatAgo(lastRefreshAt)}`;
  }
  const staleMs = lastSnapshot ? lastSnapshot.operational.pollIntervalMs * 3 : 30000;
  if (lastRefreshAt > 0 && Date.now() - lastRefreshAt > staleMs) {
    els.liveDot.classList.add("is-stale");
  }
}

async function fetchSnapshot() {
  try {
    const res = await fetch("/v1/dashboard/snapshot", {
      cache: "no-store",
      headers: { Accept: "application/json" },
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
    els.liveDot.classList.add("is-stale");
    els.errorBanner.hidden = false;
    els.errorMsg.textContent = `dashboard: ${err.message || err}`;
  }
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
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

setInterval(tickClock, 1000);
void fetchSnapshot();