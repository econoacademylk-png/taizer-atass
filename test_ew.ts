
import { Candle } from './src/types/chart';
import { calculateZigZag } from './src/utils/zigzag';
import { calculateRSI, calculateMACD, calculateATR } from './src/utils/indicators';

const dummyCandles: Candle[] = [];
for (let i = 0; i < 50; i++) {
  dummyCandles.push({
    time: 1000 + i * 60000,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1000,
    buyVolume: 500,
    sellVolume: 500,
    trades: 10,
    delta: 0,
    footprint: {}
  });
}

try {
  const zz = calculateZigZag(dummyCandles, 0.5);
  console.log('ZZ:', zz.length);
  const rsi = calculateRSI(dummyCandles, 14);
  console.log('RSI:', rsi.length);
  const macd = calculateMACD(dummyCandles, 12, 26, 9);
  console.log('MACD:', macd.macdLine.length);
} catch (e) {
  console.error('ERROR:', e);
}

