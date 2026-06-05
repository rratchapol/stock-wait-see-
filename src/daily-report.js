import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluateTicker } from "./agents.js";
import { getDailyCandles, getDailyCandlesWithMeta, getMarketSnapshot } from "./market-data.js";
import { eventsToRiskNotes, getTickerEvents, summarizeEventsForReport } from "./news-earnings.js";
import { evaluatePosition } from "./position-monitor-agent.js";
import { evaluateSelection } from "./stock-selection-agent.js";

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "config", "watchlist.json");
const UNIVERSE_PATH = path.join(ROOT, "config", "universe.json");
const REPORT_DIR = path.join(ROOT, "reports");

async function main() {
  const sampleMode = process.argv.includes("--sample");
  const screenOnly = process.argv.includes("--screen-only");
  const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  const market = sampleMode ? sampleMarket() : await getMarketSnapshot();
  const regime = marketRegime(market);
  const newsEvents = summarizeEventsForReport(config);
  const selection = sampleMode ? sampleSelection(config) : await runSelection(config);
  if (screenOnly) {
    const screenReport = renderScreenReport(selection);
    await mkdir(REPORT_DIR, { recursive: true });
    const screenPath = path.join(REPORT_DIR, `agent-1-screen-${todayBangkok()}.md`);
    await writeFile(screenPath, screenReport, "utf8");
    console.log(screenPath);
    return;
  }

  const tickers = getTickersForTechnicalAnalysis(config, selection);
  const results = [];
  const technicalByTicker = new Map();

  for (const ticker of tickers) {
    try {
      const candles = sampleMode ? sampleCandles(ticker) : await getDailyCandles(ticker, "1y");
      const technical = evaluateTicker(ticker, candles, config);
      technicalByTicker.set(ticker, technical);
      const selected = selection.candidates.find((row) => row.symbol === ticker);
      results.push({
        ...technical,
        selectionScore: selected?.selectionScore ?? null,
        company: selected?.company ?? ticker,
        selectionReasons: selected?.selectionReasons ?? [],
      });
    } catch (error) {
      results.push({
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

  results.sort((a, b) => b.score - a.score);
  const report = renderReport({ market, results, positions, newsEvents, config, selection, regime });
  await mkdir(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `daily-brief-${todayBangkok()}.md`);
  await writeFile(reportPath, report, "utf8");
  console.log(reportPath);
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
  const minScore = config.selection?.minSelectionScore ?? 70;
  const maxCandidates = config.selection?.maxCandidates ?? 15;
  const passed = rows.filter((row) => row.pass && row.selectionScore >= minScore).slice(0, maxCandidates);
  return {
    rows,
    candidates: passed,
  };
}

function getTickersForTechnicalAnalysis(config, selection) {
  const selectedTickers = config.selection?.enabled === false ? [] : selection.candidates.map((row) => row.symbol);
  const manualTickers = config.tickers ?? [];
  const positionTickers = (config.positions ?? []).map((position) => position.ticker);
  return [...new Set([...selectedTickers, ...manualTickers, ...positionTickers])];
}

function renderReport({ market, results, positions, newsEvents, config, selection, regime }) {
  const selectionRows = selection.candidates
    .slice(0, 10)
    .map((row) =>
      [
        row.symbol,
        row.selectionScore,
        row.bucket,
        fmt(row.close),
        pct(row.pullbackPct),
        compactMoney(row.avgDollarVolume20),
        row.selectionReasons.slice(0, 2).join("; "),
      ].join(" | "),
    )
    .join("\n");

  const topRows = results
    .slice(0, 10)
    .map((row) =>
      [
        row.symbol,
        row.selectionScore ?? "-",
        row.score ?? 0,
        row.action,
        fmt(row.close),
        pct(row.pullbackPct),
        fmt(row.support),
        fmt(row.resistance),
        fmt(row.riskReward),
        row.reasons?.slice(0, 2).join("; ") ?? "",
      ].join(" | "),
    )
    .join("\n");

  const buyZoneRows = results
    .filter((row) => ["BUY FIRST TRANCHE", "BUY ZONE / WAIT FOR CONFIRMATION"].includes(row.action))
    .map((row) =>
      [
        row.symbol,
        row.action,
        fmt(row.support),
        fmt(row.stopLoss),
        fmt(row.resistance),
        fmt(row.riskReward),
        row.setupType,
      ].join(" | "),
    )
    .join("\n");

  const positionRows = positions
    .map((row) =>
      [
        row.symbol,
        fmt(row.avgCost),
        row.shares ?? "-",
        fmt(row.close),
        pct(row.pnlPct),
        fmt(row.stopLoss),
        fmt(row.takeProfit1),
        row.action,
        row.reasons?.slice(0, 2).join("; ") ?? "",
      ].join(" | "),
    )
    .join("\n");

  const newsRows = newsEvents
    .map((event) =>
      [event.symbol, event.type, event.date, event.impact, event.daysUntil ?? "-", event.summary].join(" | "),
    )
    .join("\n");

  const marketRows = market
    .map((row) => `- ${row.symbol}: ${fmt(row.close)} (${pct(row.changePct)})`)
    .join("\n");

  return `# US Stock Wait & See Daily Brief

วันที่: ${todayBangkok()}
เวลา: 09:00 น. ไทย

## Market Regime

${marketRows}

ภาพรวม: ${regime}

## Agent 1 Selection

Ticker | Selection Score | Bucket | Close | Pullback | Avg Dollar Vol 20D | เหตุผล
---|---:|---|---:|---:|---:|---
${selectionRows || "_ยังไม่มีหุ้นที่ผ่าน Agent 1_"}

## Top Watchlist Today

Ticker | Selection | Technical | Action | Close | Pullback | Support | Resistance | R/R | เหตุผล
---|---:|---:|---|---:|---:|---:|---:|---:|---
${topRows || "_ไม่มีข้อมูล_"}

## Stocks Near Buy Zone

Ticker | Action | Support | Stop Loss | Target | R/R | Setup
---|---|---:|---:|---:|---:|---
${buyZoneRows || "_ยังไม่มีหุ้นที่เข้า buy zone_"}

## Current Positions

Ticker | Avg Cost | Shares | Close | P/L | Stop | TP1 | Action | เหตุผล
---|---:|---:|---:|---:|---:|---:|---|---
${positionRows || "_ยังไม่มี position ใน config/watchlist.json_"}

## News & Earnings Watch

Ticker | Type | Date | Impact | Days Until | Summary
---|---|---|---|---:|---
${newsRows || "_ยังไม่มี manual news notes หรือ earnings placeholder_"}

## Portfolio Rules

- Portfolio: ${config.portfolioThb.toLocaleString("th-TH")} บาท
- Risk per trade: ${config.riskPerTradePct}%
- Max allocation per stock: ${config.maxAllocationPctPerStock}%

## Today Decision Notes

- ใช้รายงานนี้เป็น decision support เท่านั้น ไม่ใช่คำสั่งซื้อขายอัตโนมัติ
- หุ้นที่เป็น BUY ZONE ยังควรตรวจข่าวล่าสุดและ earnings date ก่อนตัดสินใจ
- หากตลาดรวมเป็น Risk-off ให้ลด action ลง 1 ขั้นตาม checklist V2
`;
}

function renderScreenReport(selection) {
  const rows = selection.rows
    .map((row) =>
      [
        row.symbol,
        row.selectionScore,
        row.pass ? "PASS" : "REJECT",
        row.bucket ?? "-",
        fmt(row.close),
        pct(row.pullbackPct),
        compactMoney(row.avgDollarVolume20),
        row.selectionReasons?.slice(0, 3).join("; ") ?? "",
      ].join(" | "),
    )
    .join("\n");

  return `# Agent 1 Screen

วันที่: ${todayBangkok()}

Ticker | Score | Status | Bucket | Close | Pullback | Avg Dollar Vol 20D | เหตุผล
---|---:|---|---|---:|---:|---:|---
${rows || "_ไม่มีข้อมูล_"}
`;
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

function fmt(value) {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(2);
}

function pct(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function compactMoney(value) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return value.toFixed(0);
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
    const high = price * 1.015;
    const low = price * 0.985;
    const open = price * (1 + Math.sin(i) * 0.004);
    const close = price;
    candles.push({
      date: new Date(Date.now() - (260 - i) * 86400000).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: 10000000 + ((i + seed) % 30) * 1000000,
    });
  }
  return candles;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
