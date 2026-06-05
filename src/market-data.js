const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

export async function getDailyCandles(symbol, range = "1y") {
  const url = `${CHART_BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false&events=div%2Csplits`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo chart request failed for ${symbol}: ${response.status}`);
  }

  const json = await response.json();
  const result = json.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp;
  if (!result || !quote || !timestamps) {
    throw new Error(`No chart data for ${symbol}`);
  }

  return timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: quote.open[index],
      high: quote.high[index],
      low: quote.low[index],
      close: quote.close[index],
      volume: quote.volume[index],
    }))
    .filter((candle) =>
      [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite),
    );
}

export async function getDailyCandlesWithMeta(symbol, range = "1y") {
  const url = `${CHART_BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false&events=div%2Csplits`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo chart request failed for ${symbol}: ${response.status}`);
  }

  const json = await response.json();
  const result = json.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp;
  if (!result || !quote || !timestamps) {
    throw new Error(`No chart data for ${symbol}`);
  }

  const candles = timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: quote.open[index],
      high: quote.high[index],
      low: quote.low[index],
      close: quote.close[index],
      volume: quote.volume[index],
    }))
    .filter((candle) =>
      [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite),
    );

  return {
    candles,
    metadata: result.meta ?? {},
  };
}

export async function getMarketSnapshot() {
  const symbols = ["SPY", "QQQ", "^VIX"];
  const rows = await Promise.all(
    symbols.map(async (symbol) => {
      const candles = await getDailyCandles(symbol, "6mo");
      const last = candles.at(-1);
      const prev = candles.at(-2);
      return {
        symbol,
        close: last.close,
        changePct: prev ? ((last.close - prev.close) / prev.close) * 100 : 0,
      };
    }),
  );
  return rows;
}
