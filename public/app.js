const routes = {
  "/": {
    title: "Dashboard",
    eyebrow: "US Stock Decision Support",
    render: renderDashboardPage,
  },
  "/dashboard": {
    title: "Dashboard",
    eyebrow: "US Stock Decision Support",
    render: renderDashboardPage,
  },
  "/office": {
    title: "Agent Office",
    eyebrow: "Agent activity and workflow",
    render: renderOfficePage,
  },
  "/watchlist": {
    title: "Watchlist",
    eyebrow: "Selection and entry setup",
    render: renderWatchlistPage,
  },
  "/positions": {
    title: "Positions",
    eyebrow: "Portfolio monitor and buy zone",
    render: renderPositionsPage,
  },
  "/events": {
    title: "News & Earnings",
    eyebrow: "Manual notes and earnings risk",
    render: renderEventsPage,
  },
};

const stateClass = {
  idle: "state-idle",
  working: "state-working",
  success: "state-success",
  warning: "state-warning",
  error: "state-error",
};

let dashboardData = null;
let disposeCurrentView = null;

document.getElementById("refreshButton").addEventListener("click", loadDashboard);
document.querySelectorAll("[data-route]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(link.getAttribute("href"));
  });
});

window.addEventListener("popstate", renderRoute);
loadDashboard();

async function loadDashboard() {
  document.getElementById("appView").innerHTML = loadingView();
  const response = await fetch("/api/dashboard");
  dashboardData = await response.json();
  renderRoute();
}

function navigate(path) {
  if (window.location.pathname === path) return;
  history.pushState({}, "", path);
  renderRoute();
}

function renderRoute() {
  if (!dashboardData) return;
  if (disposeCurrentView) {
    disposeCurrentView();
    disposeCurrentView = null;
  }
  const route = routes[window.location.pathname] ?? routes["/dashboard"];
  document.getElementById("pageTitle").textContent = route.title;
  document.getElementById("pageEyebrow").textContent = route.eyebrow;
  document.getElementById("generatedAt").textContent = new Date(dashboardData.generatedAt).toLocaleString("th-TH");
  document.getElementById("sidebarRegime").textContent = dashboardData.regime;
  updateActiveNav();
  document.getElementById("appView").innerHTML = route.render(dashboardData);
  afterRouteRender(route, dashboardData);
}

async function afterRouteRender(route, data) {
  if (route === routes["/positions"]) {
    bindPositionForm();
    bindPositionDeletes();
    return;
  }
  if (route !== routes["/office"]) return;
  const fallback = document.getElementById("officeFallback");
  try {
    const { mountOfficeScene } = await import("/office-3d.js");
    disposeCurrentView = mountOfficeScene(document.getElementById("office3dScene"), data.agents);
    if (fallback) fallback.hidden = true;
  } catch (error) {
    if (fallback) {
      fallback.hidden = false;
      fallback.textContent = `3D scene unavailable: ${error.message}`;
    }
  }
}

function updateActiveNav() {
  const current = window.location.pathname === "/" ? "/dashboard" : window.location.pathname;
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === current);
  });
}

function renderDashboardPage(data) {
  return `
    <section class="hero-panel">
      <div>
        <span class="status-dot ${data.regime.toLowerCase()}"></span>
        <p class="eyebrow">Market Regime</p>
        <h2>${data.regime}</h2>
        <p>ภาพรวมตลาดจาก SPY, QQQ และ VIX ใช้เป็นตัวกรองก่อนตัดสินใจหุ้นรายตัว</p>
      </div>
      <div class="hero-actions">
        <a href="/watchlist" data-soft-link>ดู Watchlist</a>
        <a href="/positions" data-soft-link>ดู Positions</a>
      </div>
    </section>
    <section class="metric-grid">
      ${metric("Selection", data.selection.length, "หุ้นที่ Agent 1 คัดผ่าน")}
      ${metric("Buy Zone", data.buyZone.length, "หุ้นที่ใกล้จุดเข้า")}
      ${metric("Positions", data.positions.length, "หุ้นที่ถืออยู่")}
      ${metric("Events", data.newsEvents.length, "ข่าวและงบที่ต้องเฝ้า")}
    </section>
    <section class="dashboard-grid">
      <div class="panel">
        <div class="section-head"><h2>Market</h2><a href="/office" data-soft-link>Agent status</a></div>
        <div class="market-grid">${data.market.map(renderMarketTile).join("")}</div>
      </div>
      <div class="panel">
        <div class="section-head"><h2>Top Signals</h2><a href="/watchlist" data-soft-link>ทั้งหมด</a></div>
        <div class="stack">${data.watchlist.slice(0, 5).map((row) => compactSignal(row)).join("")}</div>
      </div>
    </section>
  `;
}

function renderOfficePage(data) {
  return `
    <section class="office-layout">
      <div class="office-viewport-panel">
        <div class="section-head">
          <h2>Live 3D Workspace</h2>
          <span>Gather-style agent room</span>
        </div>
        <div id="office3dScene" class="office-3d-scene">
          <div class="loader"></div>
        </div>
        <p id="officeFallback" class="office-fallback" hidden></p>
      </div>
      <div class="office-status-panel">
        <div class="section-head">
          <h2>Agent Status</h2>
          <span>${data.agents.length} agents</span>
        </div>
        <div class="agent-status-stack">
          ${data.agents.map(renderAgentStatusCard).join("")}
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="section-head"><h2>Workflow</h2><span>Selection -> Entry -> Monitor -> Brief</span></div>
      <div class="workflow">
        ${["คัดหุ้น", "หาแนวรับ", "ติดตาม", "สรุปรายงาน"].map((label) => `<div>${label}</div>`).join("")}
      </div>
    </section>
  `;
}

function renderAgentStatusCard(agent) {
  return `
    <article class="agent-status-card ${stateClass[agent.status] ?? ""}">
      <div>
        <span>${agent.role}</span>
        <h3>${agent.name}</h3>
        <p>${agent.message}</p>
      </div>
      <em>${agent.status}</em>
    </article>
  `;
}

function renderWatchlistPage(data) {
  return `
    <section class="panel">
      <div class="section-head"><h2>Agent 1 Selection</h2><span>${data.selection.length} candidates</span></div>
      <div class="card-grid">${data.selection.slice(0, 8).map(renderSelectionCard).join("")}</div>
    </section>
    <section class="panel">
      <div class="section-head"><h2>Top Watchlist</h2><span>เรียงตาม technical score</span></div>
      ${watchlistTable(data.watchlist)}
    </section>
  `;
}

function renderPositionsPage(data) {
  return `
    <section class="position-entry-grid">
      <div class="panel">
        <div class="section-head"><h2>Add Position</h2><span>Manual broker sync</span></div>
        <form id="positionForm" class="position-form">
          <label>
            Ticker
            <input name="ticker" placeholder="NVDA" required />
          </label>
          <label>
            Avg Cost
            <input name="avgCost" type="number" step="0.01" min="0" placeholder="210" required />
          </label>
          <label>
            Shares
            <input name="shares" type="number" step="0.0001" min="0" placeholder="2" required />
          </label>
          <label>
            Entry Date
            <input name="entryDate" type="date" value="${new Date().toISOString().slice(0, 10)}" />
          </label>
          <label>
            Stop Loss
            <input name="stopLoss" type="number" step="0.01" min="0" placeholder="195" />
          </label>
          <label>
            Take Profit 1
            <input name="takeProfit1" type="number" step="0.01" min="0" placeholder="245" />
          </label>
          <label>
            Take Profit 2
            <input name="takeProfit2" type="number" step="0.01" min="0" placeholder="280" />
          </label>
          <label class="wide-field">
            Thesis
            <input name="thesis" placeholder="Quality growth pullback" />
          </label>
          <label class="wide-field">
            Risk Notes
            <textarea name="riskNotes" rows="3" placeholder="หนึ่ง note ต่อหนึ่งบรรทัด"></textarea>
          </label>
          <div class="form-actions wide-field">
            <button type="submit">Save Position</button>
            <span id="positionFormStatus"></span>
          </div>
        </form>
      </div>
    </section>
    <section class="two-column page-columns">
      <div class="panel">
        <div class="section-head"><h2>Current Positions</h2><span>${data.positions.length} open</span></div>
        <div class="stack">${data.positions.length ? data.positions.map(renderPositionCard).join("") : empty("ยังไม่มี position ใน config")}</div>
      </div>
      <div class="panel">
        <div class="section-head"><h2>Buy Zone</h2><span>${data.buyZone.length} setup</span></div>
        <div class="stack">${data.buyZone.length ? data.buyZone.map((row) => summaryItem(row.symbol, row.action, `R/R ${fmt(row.riskReward)}`)).join("") : empty("ยังไม่มีหุ้นเข้า buy zone")}</div>
      </div>
    </section>
  `;
}

function renderEventsPage(data) {
  return `
    <section class="panel">
      <div class="section-head"><h2>News & Earnings Watch</h2><span>${data.newsEvents.length} events</span></div>
      <div class="event-list">${data.newsEvents.length ? data.newsEvents.map(renderEvent).join("") : empty("ยังไม่มี news หรือ earnings note")}</div>
    </section>
  `;
}

function renderAgentCard(agent) {
  return `
    <article class="agent-card ${stateClass[agent.status] ?? ""}">
      <div class="agent-avatar" aria-hidden="true">
        <div class="head"></div>
        <div class="body"></div>
        <div class="desk"></div>
      </div>
      <div>
        <span>${agent.role}</span>
        <h3>${agent.name}</h3>
        <p>${agent.message}</p>
      </div>
    </article>
  `;
}

function renderMarketTile(row) {
  return `
    <div class="market-tile">
      <span>${row.symbol}</span>
      <strong>${fmt(row.close)}</strong>
      <em class="${row.changePct >= 0 ? "up" : "down"}">${pct(row.changePct)}</em>
    </div>
  `;
}

function renderSelectionCard(row) {
  return `
    <article class="data-card">
      <div class="card-title"><strong>${row.symbol}</strong><span>${row.bucket}</span></div>
      <div class="score-line"><span>Score</span><strong>${row.selectionScore}</strong></div>
      <p>${row.selectionReasons?.slice(0, 2).join("; ") ?? ""}</p>
    </article>
  `;
}

function renderPositionCard(row) {
  return `
    <article class="data-card">
      <div class="card-title"><strong>${row.symbol}</strong><span>${row.action}</span></div>
      <div class="score-line"><span>P/L</span><strong class="${row.pnlPct >= 0 ? "up" : "down"}">${pct(row.pnlPct)}</strong></div>
      <p>${row.reasons?.slice(0, 2).join("; ") ?? ""}</p>
      <div class="card-actions">
        <button type="button" data-delete-position="${row.symbol}">Remove</button>
      </div>
    </article>
  `;
}

function renderEvent(row) {
  return `
    <article class="event ${row.impact}">
      <strong>${row.symbol}</strong>
      <span>${row.type} · ${row.date} · ${row.impact}</span>
      <p>${row.summary}</p>
    </article>
  `;
}

function watchlistTable(rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Selection</th>
            <th>Technical</th>
            <th>Action</th>
            <th>Close</th>
            <th>Support</th>
            <th>Resistance</th>
            <th>R/R</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .slice(0, 18)
            .map(
              (row) => `
                <tr>
                  <td><strong>${row.symbol}</strong></td>
                  <td>${row.selectionScore ?? "-"}</td>
                  <td>${row.score ?? "-"}</td>
                  <td><span class="pill">${row.action}</span></td>
                  <td>${fmt(row.close)}</td>
                  <td>${fmt(row.support)}</td>
                  <td>${fmt(row.resistance)}</td>
                  <td>${fmt(row.riskReward)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function compactSignal(row) {
  return summaryItem(row.symbol, row.action, `Tech ${row.score ?? "-"} · R/R ${fmt(row.riskReward)}`);
}

function metric(label, value, helper) {
  return `
    <div class="metric">
      <span>${label}</span>
      <strong>${value}</strong>
      <p>${helper}</p>
    </div>
  `;
}

function summaryItem(title, action, meta) {
  return `
    <article class="summary-item">
      <div>
        <strong>${title}</strong>
        <span>${meta}</span>
      </div>
      <em>${action}</em>
    </article>
  `;
}

function empty(text) {
  return `<p class="empty">${text}</p>`;
}

function loadingView() {
  return `<section class="panel loading-panel"><div class="loader"></div><p>Loading agent data...</p></section>`;
}

function fmt(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}

function pct(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "-";
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-soft-link]");
  if (!link) return;
  event.preventDefault();
  navigate(link.getAttribute("href"));
});

function bindPositionForm() {
  const form = document.getElementById("positionForm");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("positionFormStatus");
    status.textContent = "Saving...";
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/positions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Save failed");
      status.textContent = "Saved";
      await loadDashboard();
      navigate("/positions");
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

function bindPositionDeletes() {
  document.querySelectorAll("[data-delete-position]").forEach((button) => {
    button.addEventListener("click", async () => {
      const ticker = button.dataset.deletePosition;
      button.textContent = "Removing...";
      const response = await fetch(`/api/positions/${encodeURIComponent(ticker)}`, { method: "DELETE" });
      if (response.ok) {
        await loadDashboard();
        navigate("/positions");
      } else {
        button.textContent = "Remove failed";
      }
    });
  });
}
