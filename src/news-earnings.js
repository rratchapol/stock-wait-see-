export function getTickerEvents(symbol, config, now = new Date()) {
  const earnings = config.earnings?.[symbol] ?? null;
  const notes = config.newsNotes?.[symbol] ?? [];
  const earningsEvent = earnings ? normalizeEarnings(symbol, earnings, now) : null;
  const noteEvents = notes.map((note) => normalizeNote(symbol, note));

  return [earningsEvent, ...noteEvents].filter(Boolean);
}

export function summarizeEventsForReport(config, now = new Date()) {
  const symbols = new Set([
    ...Object.keys(config.earnings ?? {}),
    ...Object.keys(config.newsNotes ?? {}),
    ...(config.positions ?? []).map((position) => position.ticker),
  ]);

  return [...symbols]
    .flatMap((symbol) => getTickerEvents(symbol, config, now))
    .sort((a, b) => impactRank(b.impact) - impactRank(a.impact) || (a.daysUntil ?? 999) - (b.daysUntil ?? 999));
}

export function eventsToRiskNotes(events) {
  return events
    .filter((event) => event.impact === "high" || event.impact === "medium" || event.type === "earnings")
    .map((event) => event.summary);
}

function normalizeEarnings(symbol, earnings, now) {
  const nextDate = earnings.nextDate;
  if (!nextDate) return null;
  const daysUntil = daysBetween(startOfDay(now), new Date(`${nextDate}T00:00:00Z`));
  const holdThroughEarnings = earnings.holdThroughEarnings === true;
  const impact = daysUntil >= 0 && daysUntil <= 3 && !holdThroughEarnings ? "high" : "medium";
  return {
    symbol,
    type: "earnings",
    date: nextDate,
    daysUntil,
    impact,
    summary:
      daysUntil >= 0
        ? `earnings ในอีก ${daysUntil} วัน; holdThroughEarnings=${holdThroughEarnings}`
        : `earnings date ผ่านมาแล้ว ${Math.abs(daysUntil)} วัน; ควรอัปเดต config`,
  };
}

function normalizeNote(symbol, note) {
  return {
    symbol,
    type: note.type ?? "manual",
    date: note.date ?? "-",
    impact: note.impact ?? "medium",
    summary: note.note ?? "",
  };
}

function daysBetween(a, b) {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function impactRank(impact) {
  if (impact === "high") return 3;
  if (impact === "medium") return 2;
  if (impact === "low") return 1;
  return 0;
}
