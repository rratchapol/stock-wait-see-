import { atr, obv, rsi, sma, volumeRatio } from "./indicators.js";

export function evaluateTicker(symbol, candles, config) {
  const closes = candles.map((candle) => candle.close);
  const ma50 = sma(closes, 50);
  const ma100 = sma(closes, 100);
  const ma200 = sma(closes, 200);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);
  const volRatio = volumeRatio(candles, 20);
  const obvValues = obv(candles);

  const last = candles.at(-1);
  const prev = candles.at(-2);
  const yearHigh = Math.max(...closes);
  const pullbackPct = ((last.close - yearHigh) / yearHigh) * 100;
  const levels = findNearbyLevels(candles, last.close);
  const recentSupport = levels.support;
  const recentResistance = levels.resistance;
  const setupType = Math.abs(pullbackPct) <= 25 ? "Quality Growth Pullback" : "Oversold Reversal";

  const supportScore = scoreSupport(last.close, recentSupport, ma50.at(-1), ma100.at(-1), ma200.at(-1));
  const reversalScore = scoreReversal(candles, rsi14, setupType);
  const volumeScore = scoreVolume(candles, volRatio.at(-1), obvValues);
  const trendScore = scoreTrend(last.close, ma50.at(-1), ma100.at(-1), ma200.at(-1), ma200.at(-20));

  const stopBySupport = recentSupport * 0.97;
  const stopByAtr = recentSupport - (atr14.at(-1) ?? 0) * 1.5;
  const stopLoss = Math.min(stopBySupport, stopByAtr);
  const risk = last.close - stopLoss;
  const firstTarget = recentResistance;
  const reward = firstTarget - last.close;
  const riskReward = risk > 0 ? reward / risk : 0;
  const riskRewardScore = Math.max(0, Math.min(15, (riskReward / 2) * 15));

  const score = Math.round(supportScore + reversalScore + volumeScore + trendScore + riskRewardScore);
  const hardRejects = getHardRejects(last.close, recentSupport, riskReward, candles.length);
  const action = getAction(score, hardRejects, supportScore, reversalScore, volumeScore, trendScore);

  return {
    symbol,
    date: last.date,
    close: last.close,
    changePct: prev ? ((last.close - prev.close) / prev.close) * 100 : 0,
    setupType,
    score,
    action,
    support: recentSupport,
    resistance: recentResistance,
    stopLoss,
    riskReward,
    rsi: rsi14.at(-1),
    ma50: ma50.at(-1),
    ma100: ma100.at(-1),
    ma200: ma200.at(-1),
    volumeRatio: volRatio.at(-1),
    pullbackPct,
    reasons: buildReasons({ supportScore, reversalScore, volumeScore, trendScore, riskReward, hardRejects }),
    positionPlan: buildPositionPlan(config, last.close, stopLoss),
  };
}

function scoreSupport(close, support, ma50, ma100, ma200) {
  let score = 0;
  if (Math.abs(close - support) / close <= 0.06) score += 9;
  if (ma200 && close >= ma200 * 0.98) score += 7;
  if (ma100 && close >= ma100 * 0.98) score += 5;
  if (ma50 && close >= ma50 * 0.98) score += 4;
  return Math.min(25, score);
}

function findNearbyLevels(candles, close) {
  const lookback = candles.slice(-180);
  const pivotLows = [];
  const pivotHighs = [];

  for (let i = 2; i < lookback.length - 2; i += 1) {
    const candle = lookback[i];
    const lows = lookback.slice(i - 2, i + 3).map((row) => row.low);
    const highs = lookback.slice(i - 2, i + 3).map((row) => row.high);
    if (candle.low === Math.min(...lows)) pivotLows.push(candle.low);
    if (candle.high === Math.max(...highs)) pivotHighs.push(candle.high);
  }

  const supports = pivotLows.filter((level) => level <= close);
  const resistances = pivotHighs.filter((level) => level > close);
  const support = supports.length > 0 ? Math.max(...supports) : Math.min(...lookback.slice(-60).map((row) => row.low));
  const resistance =
    resistances.length > 0 ? Math.min(...resistances) : Math.max(...lookback.slice(-60).map((row) => row.high));

  return { support, resistance };
}

function scoreReversal(candles, rsi14, setupType) {
  const last = candles.at(-1);
  const prev = candles.at(-2);
  let score = 0;
  const body = Math.abs(last.close - last.open);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const strongClose = last.close > prev.high && last.close > last.low + (last.high - last.low) * 0.7;
  const bullish = last.close > last.open;
  const rsiNow = rsi14.at(-1);
  const rsiPrev = rsi14.at(-2);

  if (lowerWick >= body * 2 && last.close > last.open) score += 7;
  if (bullish && last.open < prev.close && last.close > prev.open) score += 7;
  if (strongClose) score += 5;
  if (setupType === "Quality Growth Pullback" && rsiNow >= 35 && rsiNow <= 55) score += 4;
  if (setupType === "Oversold Reversal" && rsiNow < 35) score += 4;
  if (rsiNow > rsiPrev) score += 3;
  return Math.min(25, score);
}

function scoreVolume(candles, ratio, obvValues) {
  let score = 0;
  const last = candles.at(-1);
  const prev = candles.at(-2);
  if (ratio >= 1.3) score += 7;
  if (ratio >= 1.5) score += 4;
  if (last.close > last.open && last.volume > prev.volume) score += 5;
  if (obvValues.at(-1) >= Math.min(...obvValues.slice(-20))) score += 4;
  return Math.min(20, score);
}

function scoreTrend(close, ma50, ma100, ma200, ma200Past) {
  let score = 0;
  if (ma200 && close > ma200) score += 6;
  if (ma50 && ma100 && ma50 > ma100) score += 4;
  if (ma100 && ma200 && ma100 > ma200) score += 3;
  if (ma200 && ma200Past && ma200 >= ma200Past * 0.99) score += 2;
  return Math.min(15, score);
}

function getHardRejects(close, support, riskReward, candleCount) {
  const rejects = [];
  if (candleCount < 220) rejects.push("ข้อมูลราคาไม่พอสำหรับ MA200");
  if (close < support * 0.97) rejects.push("ราคาปิดหลุดแนวรับหลักมากกว่า 3%");
  if (riskReward < 1) rejects.push("risk/reward ต่ำกว่า 1:1");
  return rejects;
}

function getAction(score, hardRejects, supportScore, reversalScore, volumeScore, trendScore) {
  if (hardRejects.length > 0) return "NO TRADE";
  if (score >= 85 && supportScore >= 14 && reversalScore >= 12 && volumeScore >= 10 && trendScore >= 8) {
    return "BUY FIRST TRANCHE";
  }
  if (score >= 70) return "BUY ZONE / WAIT FOR CONFIRMATION";
  if (score >= 55) return "WATCH";
  return "NO TRADE";
}

function buildPositionPlan(config, entry, stopLoss) {
  const portfolio = config.portfolioThb ?? 100000;
  const riskPct = (config.riskPerTradePct ?? 2) / 100;
  const maxAllocationPct = (config.maxAllocationPctPerStock ?? 35) / 100;
  const riskPerShare = Math.max(entry - stopLoss, 0);
  const riskBudgetThb = portfolio * riskPct;
  const maxAllocationThb = portfolio * maxAllocationPct;
  return {
    riskBudgetThb,
    maxAllocationThb,
    riskPerShareUsd: riskPerShare,
  };
}

function buildReasons({ supportScore, reversalScore, volumeScore, trendScore, riskReward, hardRejects }) {
  const reasons = [];
  if (supportScore >= 14) reasons.push("ราคาอยู่ใกล้โซนแนวรับ/MA สำคัญ");
  if (reversalScore >= 12) reasons.push("เริ่มมีสัญญาณกลับตัวจาก price action หรือ RSI");
  if (volumeScore >= 10) reasons.push("volume เริ่มยืนยันแรงซื้อ");
  if (trendScore >= 8) reasons.push("trend ใหญ่ยังพอสนับสนุน");
  if (riskReward >= 2) reasons.push("risk/reward ผ่าน 1:2");
  for (const reject of hardRejects) reasons.push(`ข้อจำกัด: ${reject}`);
  if (reasons.length === 0) reasons.push("สัญญาณยังไม่ชัดพอ");
  return reasons;
}
