export function sma(values, period) {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const window = values.slice(index + 1 - period, index + 1);
    return average(window);
  });
}

export function rsi(values, period = 14) {
  const output = Array(values.length).fill(null);
  if (values.length <= period) return output;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  output[period] = toRsi(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    output[i] = toRsi(avgGain, avgLoss);
  }

  return output;
}

export function atr(candles, period = 14) {
  const trs = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const prevClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevClose),
      Math.abs(candle.low - prevClose),
    );
  });
  return sma(trs, period);
}

export function volumeRatio(candles, period = 20) {
  const volumes = candles.map((candle) => candle.volume);
  const volumeMa = sma(volumes, period);
  return volumes.map((volume, index) => {
    const base = volumeMa[index];
    if (!base) return null;
    return volume / base;
  });
}

export function obv(candles) {
  const output = [0];
  for (let i = 1; i < candles.length; i += 1) {
    const prev = output[i - 1];
    if (candles[i].close > candles[i - 1].close) output.push(prev + candles[i].volume);
    else if (candles[i].close < candles[i - 1].close) output.push(prev - candles[i].volume);
    else output.push(prev);
  }
  return output;
}

export function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function toRsi(avgGain, avgLoss) {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}
