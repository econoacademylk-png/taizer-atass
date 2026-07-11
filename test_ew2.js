
function calculateATR(candles, period) {
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

function calculateZigZag(candles, atrMult) {
  if (candles.length === 0) return [];
  const atr = calculateATR(candles, 14);
  const pivots = [];
  
  let dir = 0; 
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
    } else if (dir === 1) { 
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
    } else if (dir === -1) {
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

const dummyCandles = [];
for (let i = 0; i < 50; i++) {
  dummyCandles.push({
    time: 1000 + i * 60000,
    open: 100 + Math.random() * 10,
    high: 110 + Math.random() * 10,
    low: 90 + Math.random() * 10,
    close: 105 + Math.random() * 10,
  });
}

try {
  const zz = calculateZigZag(dummyCandles, 0.5);
  console.log('ZZ:', zz.length);
  // test the logic
  const pivots = zz;
  let ewPoints = [];
  let isBullTrend = true;
  let rulesPass = false;
  if (pivots.length >= 6) {
      const recentPivots = pivots.slice(-6);
      const p0 = recentPivots[0];
      const p1 = recentPivots[1];
      const p2 = recentPivots[2];
      const p3 = recentPivots[3];
      const p4 = recentPivots[4];
      const p5 = recentPivots[5];
      console.log('p0', p0);
  }
} catch (e) {
  console.error('ERROR:', e);
}

