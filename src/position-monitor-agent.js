export function evaluatePosition(position, technical, marketRegime, eventRiskNotes = []) {
  const close = technical.close;
  const avgCost = position.avgCost;
  const shares = position.shares ?? 0;
  const stopLoss = position.stopLoss ?? technical.stopLoss;
  const takeProfit1 = position.takeProfit1 ?? technical.resistance;
  const takeProfit2 = position.takeProfit2 ?? null;
  const marketValue = close * shares;
  const costValue = avgCost * shares;
  const pnlUsd = marketValue - costValue;
  const pnlPct = avgCost > 0 ? ((close - avgCost) / avgCost) * 100 : 0;
  const distanceToStopPct = stopLoss ? ((close - stopLoss) / close) * 100 : null;
  const distanceToTp1Pct = takeProfit1 ? ((takeProfit1 - close) / close) * 100 : null;
  const action = getMonitorAction({
    close,
    avgCost,
    stopLoss,
    takeProfit1,
    takeProfit2,
    pnlPct,
    technical,
    marketRegime,
    riskNotes: [...(position.riskNotes ?? []), ...eventRiskNotes],
  });

  return {
    symbol: position.ticker,
    avgCost,
    shares,
    close,
    marketValue,
    costValue,
    pnlUsd,
    pnlPct,
    stopLoss,
    takeProfit1,
    takeProfit2,
    distanceToStopPct,
    distanceToTp1Pct,
    thesis: position.thesis ?? "-",
    entryDate: position.entryDate ?? "-",
    action,
    reasons: buildReasons({
      action,
      close,
      stopLoss,
      takeProfit1,
      pnlPct,
      technical,
      marketRegime,
      riskNotes: [...(position.riskNotes ?? []), ...eventRiskNotes],
    }),
  };
}

function getMonitorAction({ close, stopLoss, takeProfit1, takeProfit2, pnlPct, technical, marketRegime, riskNotes }) {
  if (riskNotes.length > 0) return "REVIEW THESIS";
  if (stopLoss && close <= stopLoss) return "EXIT";
  if (pnlPct <= -15 || close <= technical.support * 0.98) return "REDUCE RISK";
  if (takeProfit2 && close >= takeProfit2) return "TAKE PROFIT";
  if (takeProfit1 && close >= takeProfit1) return "TAKE PARTIAL PROFIT";
  if (marketRegime === "Risk-off" && pnlPct < 0) return "WATCH CLOSELY";
  if (technical.action === "BUY FIRST TRANCHE" || technical.action === "BUY ZONE / WAIT FOR CONFIRMATION") {
    return "HOLD / POSSIBLE ADD";
  }
  return "HOLD";
}

function buildReasons({ action, close, stopLoss, takeProfit1, pnlPct, technical, marketRegime, riskNotes }) {
  const reasons = [];
  if (riskNotes.length > 0) reasons.push(`มี risk notes: ${riskNotes.join("; ")}`);
  if (stopLoss && close <= stopLoss) reasons.push("ราคาปิดถึงหรือต่ำกว่า stop loss");
  if (pnlPct <= -15) reasons.push("ขาดทุนเกิน -15% ต้องทบทวน thesis");
  if (close <= technical.support * 0.98) reasons.push("ราคาหลุดต่ำกว่าแนวรับของ Agent 2");
  if (takeProfit1 && close >= takeProfit1) reasons.push("ราคาถึง target แรก");
  if (marketRegime === "Risk-off") reasons.push("ตลาดรวมเป็น Risk-off");
  if (technical.score >= 70) reasons.push("technical setup ยังแข็งแรง");
  if (reasons.length === 0) reasons.push(`${action}: thesis ยังไม่ถูก invalidate`);
  return reasons;
}
