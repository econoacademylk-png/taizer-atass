
import { Candle } from '../types/chart';

export function calculateATR(candles: Candle[], period: number = 14): number[] {
  if (candles.length === 0) return [];
  const atr = new Array(candles.length).fill(0);
  let trSum = 0;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const pc = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - pc.close),
      Math.abs(c.low - pc.close)
    );
    if (i <= period) {
      trSum += tr;
      atr[i] = trSum / i;
    } else {
      atr[i] = (atr[i - 1] * (period - 1) + tr) / period;
    }
  }
  return atr;
}

export function calculateRSI(candles: Candle[], period: number = 14): number[] {
  if (candles.length === 0) return [];
  const rsi = new Array(candles.length).fill(50);
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period && i < candles.length; i++) {
    const change = candles[i].close - candles[i-1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period; i < candles.length; i++) {
    const change = candles[i].close - candles[i-1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }
  return rsi;
}

export function calculateEMA(data: number[], period: number): number[] {
  const ema = new Array(data.length).fill(0);
  const k = 2 / (period + 1);
  ema[0] = data[0];
  for (let i = 1; i < data.length; i++) {
    ema[i] = data[i] * k + ema[i-1] * (1 - k);
  }
  return ema;
}

export function calculateMACD(candles: Candle[], fast: number = 12, slow: number = 26, sig: number = 9) {
  const closes = candles.map(c => c.close);
  const fastEma = calculateEMA(closes, fast);
  const slowEma = calculateEMA(closes, slow);
  
  const macdLine = fastEma.map((f, i) => f - slowEma[i]);
  const signalLine = calculateEMA(macdLine, sig);
  const histogram = macdLine.map((m, i) => m - signalLine[i]);
  
  return { macdLine, signalLine, histogram };
}

