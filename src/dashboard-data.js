import { readFile } from "node:fs/promises";
import path from "node:path";
import { evaluateTicker } from "./agents.js";
import { getDailyCandles, getDailyCandlesWithMeta, getMarketSnapshot } from "./market-data.js";
import { eventsToRiskNotes, getTickerEvents, summarizeEventsForReport } from "./news-earnings.js";
import { evaluatePosition } from "./position-monitor-agent.js";
import { evaluateSelection } from "./stock-selection-agent.js";

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "config", "watchlist.json");
const UNIVERSE_PATH = path.join(ROOT, "config", "universe.json");

export async function buildDashboardData({ sampleMode = false } = {}) {
  const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  const market = sampleMode ? sampleMarket() : await getMarketSnapshot();
  const regime = marketRegime(market);
  const selection = sampleMode ? sampleSelection(config) : await runSelection(config);
  const newsEvents = summarizeEventsForReport(config);
  const tickers = getTickersForTechnicalAnalysis(config, selection);
  const technicalByTicker = new Map();
  const watchlist = [];

  for (const ticker of tickers) {
    try {
      const candles = sampleMode ? sampleCandles(ticker) : await getDailyCandles(ticker, "1y");
      const technical = evaluateTicker(ticker, candles, config);
      const selected = selection.candidates.find((row) => row.symbol === ticker);
      technicalByTicker.set(ticker, technical);
      watchlist.push({
        ...technical,
        selectionScore: selected?.selectionScore ?? null,
        company: selected?.company ?? ticker,
        selectionReasons: selected?.selectionReasons ?? [],
      });
    } catch (error) {
      watchlist.push({
        symbol: ticker,
        score: 0,
        action: "DATA ERROR",
        reasons: [error.message],
      });
    }
  }

  const positions = [];
  for (const position of config.positions ?? []) {
    const ticker = position.ticker;
    try {
      let technical = technicalByTicker.get(ticker);
      if (!technical) {
        const candles = sampleMode ? sampleCandles(ticker) : await getDailyCandles(ticker, "1y");
        technical = evaluateTicker(ticker, candles, config);
        technicalByTicker.set(ticker, technical);
      }
      const eventRiskNotes = eventsToRiskNotes(getTickerEvents(ticker, config));
      positions.push(evaluatePosition(position, technical, regime, eventRiskNotes));
    } catch (error) {
      positions.push({
        symbol: ticker,
        action: "DATA ERROR",
        reasons: [error.message],
      });
    }
  }

  watchlist.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return {
    generatedAt: new Date().toISOString(),
    reportDate: todayBangkok(),
    market,
    regime,
    selection: selection.candidates,
    watchlist,
    buyZone: watchlist.filter((row) => ["BUY FIRST TRANCHE", "BUY ZONE / WAIT FOR CONFIRMATION"].includes(row.action)),
    positions,
    newsEvents,
    portfolioRules: {
      portfolioThb: config.portfolioThb,
      riskPerTradePct: config.riskPerTradePct,
      maxAllocationPctPerStock: config.maxAllocationPctPerStock,
    },
    agents: buildAgentStatus({ selection, watchlist, positions, newsEvents }),
  };
}

async function runSelection(config) {
  const universe = JSON.parse(await readFile(UNIVERSE_PATH, "utf8"));
  const rows = [];

  for (const ticker of universe.tickers) {
    try {
      const { candles, metadata } = await getDailyCandlesWithMeta(ticker, "1y");
      rows.push(evaluateSelection(ticker, candles, metadata, config.fundamentalOverrides ?? {}));
    } catch (error) {
      rows.push({
        symbol: ticker,
        company: ticker,
        selectionScore: 0,
        pass: false,
        rejectReasons: [error.message],
        selectionReasons: [error.message],
      });
    }
  }

  rows.sort((a, b) => b.selectionScore - a.selectionScore);
  const minScore = config.selection?.minSelectionScore ?? 45;
  const maxCandidates = config.selection?.maxCandidates ?? 15;
  return {
    rows,
    candidates: rows.filter((row) => row.pass && row.selectionScore >= minScore).slice(0, maxCandidates),
  };
}

function getTickersForTechnicalAnalysis(config, selection) {
  const selectedTickers = config.selection?.enabled === false ? [] : selection.candidates.map((row) => row.symbol);
  const manualTickers = config.tickers ?? [];
  const positionTickers = (config.positions ?? []).map((position) => position.ticker);
  return [...new Set([...selectedTickers, ...manualTickers, ...positionTickers])];
}

function buildAgentStatus({ selection, watchlist, positions, newsEvents }) {
  const buyZoneCount = watchlist.filter((row) =>
    ["BUY FIRST TRANCHE", "BUY ZONE / WAIT FOR CONFIRMATION"].includes(row.action),
  ).length;
  return [
    {
      id: "agent1",
      name: "Selection Agent",
      role: "คัดหุ้น",
      status: selection.candidates.length > 0 ? "success" : "warning",
      message: `พบ candidate ${selection.candidates.length} ตัว`,
    },
    {
      id: "agent2",
      name: "Entry Agent",
      role: "หาแนวรับ",
      status: buyZoneCount > 0 ? "success" : "working",
      message: buyZoneCount > 0 ? `มี buy zone ${buyZoneCount} ตัว` : "ยังรอสัญญาณที่ชัดขึ้น",
    },
    {
      id: "agent3",
      name: "Monitor Agent",
      role: "ติดตามสถานะ",
      status: positions.some((row) => ["REDUCE RISK", "EXIT", "REVIEW THESIS"].includes(row.action)) ? "warning" : "idle",
      message: positions.length > 0 ? `ติดตาม ${positions.length} position` : "ยังไม่มี position",
    },
    {
      id: "agent4",
      name: "Brief Agent",
      role: "สรุปรายงาน",
      status: newsEvents.some((event) => event.impact === "high") ? "warning" : "success",
      message: `events ${newsEvents.length} รายการ`,
    },
  ];
}

function marketRegime(market) {
  const spy = market.find((row) => row.symbol === "SPY");
  const qqq = market.find((row) => row.symbol === "QQQ");
  const vix = market.find((row) => row.symbol === "^VIX");
  if ((vix?.close ?? 0) > 25 || (spy?.changePct ?? 0) < -1.5 || (qqq?.changePct ?? 0) < -1.8) return "Risk-off";
  if ((spy?.changePct ?? 0) > 0 && (qqq?.changePct ?? 0) > 0 && (vix?.close ?? 99) < 20) return "Risk-on";
  return "Neutral";
}

function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function sampleSelection(config) {
  const rows = config.tickers.map((ticker, index) => ({
    symbol: ticker,
    company: ticker,
    selectionScore: 80 - index,
    bucket: index % 2 === 0 ? "Quality Growth Pullback" : "Strong Business Deep Pullback",
    pass: index < 5,
    close: 100 + index,
    pullbackPct: -10 - index,
    avgDollarVolume20: 100_000_000 + index * 10_000_000,
    selectionReasons: ["sample liquidity ผ่าน", "sample pullback น่าสนใจ"],
  }));
  return {
    rows,
    candidates: rows.filter((row) => row.pass),
  };
}

function sampleMarket() {
  return [
    { symbol: "SPY", close: 600, changePct: 0.2 },
    { symbol: "QQQ", close: 520, changePct: 0.4 },
    { symbol: "^VIX", close: 16, changePct: -2.1 },
  ];
}

function sampleCandles(symbol) {
  const seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const candles = [];
  let price = 100 + (seed % 80);
  for (let i = 0; i < 260; i += 1) {
    const wave = Math.sin((i + seed) / 13) * 2;
    const drift = i < 210 ? 0.08 : -0.15;
    price = Math.max(10, price + wave * 0.08 + drift);
    candles.push({
      date: new Date(Date.now() - (260 - i) * 86400000).toISOString().slice(0, 10),
      open: price * (1 + Math.sin(i) * 0.004),
      high: price * 1.015,
      low: price * 0.985,
      close: price,
      volume: 10000000 + ((i + seed) % 30) * 1000000,
    });
  }
  return candles;
}
