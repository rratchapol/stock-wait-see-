import { atr, sma } from "./indicators.js";

export function evaluateSelection(symbol, candles, metadata = {}, overrides = {}) {
  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);
  const ma50 = sma(closes, 50);
  const ma100 = sma(closes, 100);
  const ma200 = sma(closes, 200);
  const atr14 = atr(candles, 14);
  const last = candles.at(-1);
  const yearHigh = Math.max(...closes);
  const yearLow = Math.min(...closes);
  const pullbackPct = ((last.close - yearHigh) / yearHigh) * 100;
  const avgVolume20 = average(volumes.slice(-20));
  const avgDollarVolume20 = avgVolume20 * last.close;
  const volatilityPct = ((atr14.at(-1) ?? 0) / last.close) * 100;
  const override = overrides[symbol] ?? {};

  const liquidity = scoreLiquidity(last.close, avgDollarVolume20);
  const trendDurability = scoreTrendDurability(last.close, ma50.at(-1), ma100.at(-1), ma200.at(-1), ma200.at(-40));
  const pullback = scorePullback(Math.abs(pullbackPct), last.close, ma200.at(-1));
  const volatility = scoreVolatility(volatilityPct);

  // TODO: Re-enable true fundamental scoring after a reliable data provider is added.
  // Paused for now because Yahoo quoteSummary/quote endpoints return 401 without a valid session crumb.
  // Planned fields: revenue growth, margin quality, free cash flow, debt, valuation, earnings revisions.
  const fundamentalPlaceholder = 0;

  const score = Math.round(liquidity + trendDurability + pullback + volatility + fundamentalPlaceholder);
  const bucket = getBucket(Math.abs(pullbackPct), last.close, ma200.at(-1));
  const rejectReasons = getRejectReasons({
    close: last.close,
    avgDollarVolume20,
    candleCount: candles.length,
    volatilityPct,
    override,
  });

  return {
    symbol,
    company: metadata.longName ?? metadata.shortName ?? symbol,
    exchange: metadata.fullExchangeName ?? metadata.exchangeName ?? "-",
    selectionScore: rejectReasons.length ? Math.min(score, 54) : score,
    bucket,
    pass: rejectReasons.length === 0,
    close: last.close,
    pullbackPct,
    yearHigh,
    yearLow,
    avgDollarVolume20,
    volatilityPct,
    rejectReasons,
    selectionReasons: buildSelectionReasons({
      liquidity,
      trendDurability,
      pullback,
      volatility,
      rejectReasons,
    }),
    metrics: {
      liquidity,
      trendDurability,
      pullback,
      volatility,
      fundamentalPlaceholder,
    },
  };
}

function scoreLiquidity(close, avgDollarVolume20) {
  let score = 0;
  if (close >= 5) score += 3;
  if (avgDollarVolume20 >= 30_000_000) score += 4;
  if (avgDollarVolume20 >= 100_000_000) score += 3;
  return score;
}

function scoreTrendDurability(close, ma50, ma100, ma200, ma200Past) {
  let score = 0;
  if (ma200 && close >= ma200) score += 8;
  if (ma50 && ma100 && ma50 >= ma100) score += 5;
  if (ma100 && ma200 && ma100 >= ma200) score += 5;
  if (ma200 && ma200Past && ma200 >= ma200Past * 0.98) score += 7;
  return Math.min(25, score);
}

function scorePullback(absPullbackPct, close, ma200) {
  let score = 0;
  if (absPullbackPct >= 8 && absPullbackPct <= 25) score += 12;
  else if (absPullbackPct > 25 && absPullbackPct <= 50) score += 9;
  else if (absPullbackPct > 3 && absPullbackPct < 8) score += 5;

  if (ma200 && close >= ma200 * 0.9) score += 5;
  return Math.min(15, score);
}

function scoreVolatility(volatilityPct) {
  if (volatilityPct <= 0) return 0;
  if (volatilityPct <= 2.5) return 10;
  if (volatilityPct <= 4) return 7;
  if (volatilityPct <= 6) return 4;
  return 1;
}

function getBucket(absPullbackPct, close, ma200) {
  if (absPullbackPct <= 25 && (!ma200 || close >= ma200 * 0.95)) return "Quality Growth Pullback";
  if (absPullbackPct <= 50) return "Strong Business Deep Pullback";
  return "High Risk Deep Drawdown";
}

function getRejectReasons({ close, avgDollarVolume20, candleCount, volatilityPct, override }) {
  const reasons = [];
  if (override.reject === true) reasons.push(override.rejectReason ?? "manual reject");
  if (candleCount < 220) reasons.push("ข้อมูลราคาไม่พอสำหรับ MA200");
  if (close < 5) reasons.push("ราคาต่ำกว่า 5 USD");
  if (avgDollarVolume20 < 30_000_000) reasons.push("average daily dollar volume ต่ำกว่า 30M USD");
  if (volatilityPct > 8) reasons.push("volatility สูงเกิน threshold MVP");
  return reasons;
}

function buildSelectionReasons({
  liquidity,
  trendDurability,
  pullback,
  volatility,
  rejectReasons,
}) {
  const reasons = [];
  if (liquidity >= 7) reasons.push("liquidity ผ่านเกณฑ์");
  if (trendDurability >= 15) reasons.push("trend durability ดี");
  if (pullback >= 10) reasons.push("pullback อยู่ในโซนน่าสนใจ");
  if (volatility >= 7) reasons.push("volatility ยังควบคุมได้");
  for (const reason of rejectReasons) reasons.push(`reject: ${reason}`);
  if (reasons.length === 0) reasons.push("ยังไม่เด่นพอสำหรับ Agent 1");
  return reasons;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}
