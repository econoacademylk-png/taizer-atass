
import { Candle } from '../types/chart';
import { calculateATR } from './indicators';

export interface Pivot {
  index: number;
  price: number;
  type: 'high' | 'low';
}

export function calculateZigZag(candles: Candle[], atrMult: number = 1.0): Pivot[] {
  if (candles.length === 0) return [];
  const atr = calculateATR(candles, 14);
  const pivots: Pivot[] = [];
  
  let dir = 0; // 1 for finding high, -1 for finding low
  let extremeIdx = 0;
  let extremePrice = candles[0].close;
  
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const threshold = atr[i] * atrMult;
    
    if (dir === 0) {
      if (c.high > extremePrice + threshold) {
        dir = 1;
        extremeIdx = i;
        extremePrice = c.high;
        pivots.push({ index: i, price: c.high, type: 'high' });
      } else if (c.low < extremePrice - threshold) {
        dir = -1;
        extremeIdx = i;
        extremePrice = c.low;
        pivots.push({ index: i, price: c.low, type: 'low' });
      }
    } else if (dir === 1) { // We are looking for a high
      if (c.high > extremePrice) {
        extremeIdx = i;
        extremePrice = c.high;
        if (pivots.length > 0 && pivots[pivots.length - 1].type === 'high') {
            pivots[pivots.length - 1] = { index: i, price: c.high, type: 'high' };
        } else {
            pivots.push({ index: i, price: c.high, type: 'high' });
        }
      } else if (c.low < extremePrice - threshold) {
        dir = -1;
        extremeIdx = i;
        extremePrice = c.low;
        pivots.push({ index: i, price: c.low, type: 'low' });
      }
    } else if (dir === -1) { // We are looking for a low
      if (c.low < extremePrice) {
        extremeIdx = i;
        extremePrice = c.low;
        if (pivots.length > 0 && pivots[pivots.length - 1].type === 'low') {
            pivots[pivots.length - 1] = { index: i, price: c.low, type: 'low' };
        } else {
            pivots.push({ index: i, price: c.low, type: 'low' });
        }
      } else if (c.high > extremePrice + threshold) {
        dir = 1;
        extremeIdx = i;
        extremePrice = c.high;
        pivots.push({ index: i, price: c.high, type: 'high' });
      }
    }
  }
  return pivots;
}

