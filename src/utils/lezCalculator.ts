import { Candle } from "../types/chart";

export interface LEZSettings {
  emaLength: number;
  useEmaTrendFilter: boolean;
  swingPivotLength: number;
  storedLiquidityLevels: number;
  minSweepDistanceAtr: number;
  minSweepWickPct: number;
  maxBodyPct: number;
  minCandleRangeAtr: number;
  longConfirmationMustBeBullish: boolean;
  shortConfirmationMustBeBearish: boolean;
  maxBarsAfterSweep: number;
  requireSweepMidlineBreak: boolean;
  cooldownBars: number;
  atrLength: number;
  guideExtensionBars: number;
  stopLossAtrMultiplier: number;
  takeProfitRR: number;
  blockNewSignalsWhileActive: boolean;
}

export const DEFAULT_LEZ_SETTINGS: LEZSettings = {
  emaLength: 50,
  useEmaTrendFilter: true,
  swingPivotLength: 5,
  storedLiquidityLevels: 20,
  minSweepDistanceAtr: 0.1,
  minSweepWickPct: 0.35,
  maxBodyPct: 0.65,
  minCandleRangeAtr: 0.2,
  longConfirmationMustBeBullish: true,
  shortConfirmationMustBeBearish: true,
  maxBarsAfterSweep: 2,
  requireSweepMidlineBreak: true,
  cooldownBars: 10,
  atrLength: 14,
  guideExtensionBars: 20,
  stopLossAtrMultiplier: 1.5,
  takeProfitRR: 3,
  blockNewSignalsWhileActive: true
};

export interface LEZSignal {
  type: "buy" | "sell";
  index: number;
  candle: Candle;
  sweepCandleIndex: number;
  sweptPrice: number;
  qualityScore: number;
  trade?: {
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    exitIndex?: number;
    exitType?: "tp" | "sl";
  };
}

export interface LEZSweepGuide {
  type: "high" | "low";
  price: number;
  startIndex: number;
  sweepIndex: number;
  endIndex: number;
}

export function calculateLEZ(candles: Candle[], settings: LEZSettings = DEFAULT_LEZ_SETTINGS) {
  const signals: LEZSignal[] = [];
  const guides: LEZSweepGuide[] = [];

  if (!candles || candles.length < 50) return { signals, guides };

  // 1. Calculate TR, ATR
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i-1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const atr: number[] = new Array(candles.length).fill(0);
  for (let i = settings.atrLength; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < settings.atrLength; j++) {
      sum += tr[i - j];
    }
    atr[i] = sum / settings.atrLength;
  }

  // 2. Calculate EMA
  const ema: number[] = new Array(candles.length).fill(0);
  const multiplier = 2 / (settings.emaLength + 1);
  let initialSma = 0;
  for(let i=0; i<settings.emaLength && i < candles.length; i++){
    initialSma += candles[i].close;
  }
  initialSma /= settings.emaLength;
  if (candles.length > settings.emaLength) {
    ema[settings.emaLength - 1] = initialSma;
    for (let i = settings.emaLength; i < candles.length; i++) {
      ema[i] = (candles[i].close - ema[i-1]) * multiplier + ema[i-1];
    }
  }

  // 3. Find Swing Pivots
  const swingHighs: {price: number, index: number, swept: boolean}[] = [];
  const swingLows: {price: number, index: number, swept: boolean}[] = [];

  let pendingSweep: { 
    type: "bull" | "bear", 
    sweepIndex: number, 
    sweptPrice: number, 
    barsSinceSweep: number,
    midline: number,
    qualityScore: number
  } | null = null;
  let cooldownCounter = 0;
  
  let activeTrade: LEZSignal | null = null;

  for (let i = settings.swingPivotLength; i < candles.length; i++) {
    const c = candles[i];
    const cAtr = atr[i];
    const cEma = ema[i];

    if (cooldownCounter > 0) cooldownCounter--;

    // A. Detect if `i - swingPivotLength` is a pivot
    const pIdx = i - settings.swingPivotLength;
    if (pIdx >= settings.swingPivotLength) {
      let isHigh = true;
      let isLow = true;
      const pCandle = candles[pIdx];
      for (let j = 1; j <= settings.swingPivotLength; j++) {
        if (candles[pIdx - j].high > pCandle.high || candles[pIdx + j].high > pCandle.high) isHigh = false;
        if (candles[pIdx - j].low < pCandle.low || candles[pIdx + j].low < pCandle.low) isLow = false;
      }
      
      if (isHigh) {
        swingHighs.push({ price: pCandle.high, index: pIdx, swept: false });
        if (swingHighs.length > settings.storedLiquidityLevels) swingHighs.shift();
      }
      if (isLow) {
        swingLows.push({ price: pCandle.low, index: pIdx, swept: false });
        if (swingLows.length > settings.storedLiquidityLevels) swingLows.shift();
      }
    }

    // B. Check Active Trade Exit
    if (activeTrade && activeTrade.trade) {
      if (activeTrade.type === "buy") {
        if (c.low <= activeTrade.trade.slPrice) {
          activeTrade.trade.exitIndex = i;
          activeTrade.trade.exitType = "sl";
          activeTrade = null;
        } else if (c.high >= activeTrade.trade.tpPrice) {
          activeTrade.trade.exitIndex = i;
          activeTrade.trade.exitType = "tp";
          activeTrade = null;
        }
      } else {
        if (c.high >= activeTrade.trade.slPrice) {
          activeTrade.trade.exitIndex = i;
          activeTrade.trade.exitType = "sl";
          activeTrade = null;
        } else if (c.low <= activeTrade.trade.tpPrice) {
          activeTrade.trade.exitIndex = i;
          activeTrade.trade.exitType = "tp";
          activeTrade = null;
        }
      }
    }

    // C. If pending sweep, check for confirmation
    if (pendingSweep) {
      pendingSweep.barsSinceSweep++;
      if (pendingSweep.barsSinceSweep > settings.maxBarsAfterSweep) {
        pendingSweep = null; // Expired
      } else {
        let confirmed = false;
        if (pendingSweep.type === "bull") {
          const isBullish = !settings.longConfirmationMustBeBullish || c.close > c.open;
          const brokeMidline = !settings.requireSweepMidlineBreak || c.close > pendingSweep.midline;
          if (isBullish && brokeMidline) confirmed = true;
        } else {
          const isBearish = !settings.shortConfirmationMustBeBearish || c.close < c.open;
          const brokeMidline = !settings.requireSweepMidlineBreak || c.close < pendingSweep.midline;
          if (isBearish && brokeMidline) confirmed = true;
        }

        if (confirmed && (!activeTrade || !settings.blockNewSignalsWhileActive)) {
          const entryPrice = c.close;
          const slMult = settings.stopLossAtrMultiplier * cAtr;
          let slPrice = 0;
          let tpPrice = 0;

          if (pendingSweep.type === "bull") {
            slPrice = entryPrice - slMult;
            tpPrice = entryPrice + (entryPrice - slPrice) * settings.takeProfitRR;
          } else {
            slPrice = entryPrice + slMult;
            tpPrice = entryPrice - (slPrice - entryPrice) * settings.takeProfitRR;
          }

          const newSignal: LEZSignal = {
            type: pendingSweep.type === "bull" ? "buy" : "sell",
            index: i,
            candle: c,
            sweepCandleIndex: pendingSweep.sweepIndex,
            sweptPrice: pendingSweep.sweptPrice,
            qualityScore: pendingSweep.qualityScore,
            trade: {
              entryPrice,
              slPrice,
              tpPrice
            }
          };

          signals.push(newSignal);
          activeTrade = newSignal;
          cooldownCounter = settings.cooldownBars;
          pendingSweep = null;
          continue; 
        }
      }
    }

    // D. Detect Sweeps
    if (cooldownCounter === 0 && cAtr > 0 && (!activeTrade || !settings.blockNewSignalsWhileActive)) {
      const range = c.high - c.low;
      const body = Math.abs(c.close - c.open);
      const topWick = c.high - Math.max(c.open, c.close);
      const bottomWick = Math.min(c.open, c.close) - c.low;
      const midline = (c.high + c.low) / 2;

      // Candle Quality Filters
      if (range >= settings.minCandleRangeAtr * cAtr && (body / range) <= settings.maxBodyPct) {
        
        let foundSweep = false;

        // Check Bullish Sweep (Sweeping Swing Low)
        if ((bottomWick / range) >= settings.minSweepWickPct) {
          for (let k = swingLows.length - 1; k >= 0; k--) {
            const sl = swingLows[k];
            if (!sl.swept && c.low <= sl.price && c.close > sl.price) {
              const distance = sl.price - c.low;
              if (distance >= settings.minSweepDistanceAtr * cAtr) {
                if (!settings.useEmaTrendFilter || c.close > cEma) {
                  sl.swept = true;
                  foundSweep = true;
                  const quality = Math.min(99, Math.floor((bottomWick / range) * 100));
                  pendingSweep = { type: "bull", sweepIndex: i, sweptPrice: sl.price, barsSinceSweep: 0, midline, qualityScore: quality };
                  guides.push({ type: "low", price: sl.price, startIndex: sl.index, sweepIndex: i, endIndex: i + settings.guideExtensionBars });
                  break;
                }
              }
            }
          }
        }

        // Check Bearish Sweep (Sweeping Swing High)
        if (!foundSweep && (topWick / range) >= settings.minSweepWickPct) {
          for (let k = swingHighs.length - 1; k >= 0; k--) {
            const sh = swingHighs[k];
            if (!sh.swept && c.high >= sh.price && c.close < sh.price) {
              const distance = c.high - sh.price;
              if (distance >= settings.minSweepDistanceAtr * cAtr) {
                if (!settings.useEmaTrendFilter || c.close < cEma) {
                  sh.swept = true;
                  foundSweep = true;
                  const quality = Math.min(99, Math.floor((topWick / range) * 100));
                  pendingSweep = { type: "bear", sweepIndex: i, sweptPrice: sh.price, barsSinceSweep: 0, midline, qualityScore: quality };
                  guides.push({ type: "high", price: sh.price, startIndex: sh.index, sweepIndex: i, endIndex: i + settings.guideExtensionBars });
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  return { signals, guides };
}
