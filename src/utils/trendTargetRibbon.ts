/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle } from '../types/chart';

export interface RibbonPoint {
  time: number;
  alma: number;
  ribbonMid: number;
  ribbonEdge: number;
  upperConfirm: number;
  lowerConfirm: number;
  trend: number; // 1 for bull, -1 for bear, 0 for neutral
  conviction: number; // 0.0 to 1.0
  bullFlip: boolean;
  bearFlip: boolean;
  candleColor?: string;
}

export interface PositionSetup {
  id: string;
  entryBar: number;
  entryTime: number;
  endBar: number;
  endTime?: number;
  direction: 1 | -1; // 1 for Long, -1 for Short
  entryPrice: number;
  stopPrice: number;
  riskDist: number;
  targets: {
    level: number;
    price: number;
    hit: boolean;
    hitBar?: number;
  }[];
  stoppedOut: boolean;
  positionEnded: boolean;
}

export interface TrendTargetRibbonData {
  points: RibbonPoint[];
  positions: PositionSetup[];
  currentTrend: number;
}

export interface RibbonConfig {
  almaLen?: number;
  almaOffset?: number;
  almaSigma?: number;
  devLen?: number;
  devMult?: number;
  slopeLen?: number;
  slopeMin?: number;
  atrLen?: number;
  stopLookback?: number;
  minStopAtr?: number;
  maxStopAtr?: number;
  targetCount?: number;
  zonePct?: number;
  approachR?: number;
  extendBars?: number;
  keepPositions?: number;
  buyCol?: string;
  sellCol?: string;
  tpCol?: string;
  slCol?: string;
}

export function calculateTrendTargetRibbon(
  candles: Candle[],
  config: RibbonConfig = {}
): TrendTargetRibbonData {
  const {
    almaLen = 34,
    almaOffset = 0.85,
    almaSigma = 6.0,
    devLen = 34,
    devMult = 0.65,
    slopeLen = 3,
    slopeMin = 0.08,
    atrLen = 14,
    stopLookback = 12,
    minStopAtr = 0.75,
    maxStopAtr = 3.0,
    targetCount = 4,
    extendBars = 30,
    keepPositions = 4,
    buyCol = '#00FF00',
    sellCol = '#FF0066',
  } = config;

  const n = candles ? candles.length : 0;
  if (n < Math.max(almaLen, devLen, atrLen) + 5) {
    return { points: [], positions: [], currentTrend: 0 };
  }

  // 1. Calculate ALMA
  const alma = new Array(n).fill(NaN);
  const m = almaOffset * (almaLen - 1);
  const s = almaLen / almaSigma;
  let norm = 0;
  const weights = new Float64Array(almaLen);
  for (let i = 0; i < almaLen; i++) {
    const w = Math.exp(-((i - m) * (i - m)) / (2 * s * s));
    weights[i] = w;
    norm += w;
  }
  if (norm === 0) norm = 1;

  for (let t = almaLen - 1; t < n; t++) {
    let sum = 0;
    for (let i = 0; i < almaLen; i++) {
      const c = candles[t - (almaLen - 1 - i)];
      if (c && typeof c.close === 'number' && !isNaN(c.close)) {
        sum += c.close * weights[i];
      }
    }
    alma[t] = sum / norm;
  }

  // 2. Calculate Standard Deviation of Close (length: devLen)
  const dev = new Array(n).fill(0);
  for (let t = devLen - 1; t < n; t++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < devLen; i++) {
      const c = candles[t - i];
      if (c && typeof c.close === 'number' && !isNaN(c.close)) {
        sum += c.close;
        count++;
      }
    }
    if (count === 0) {
      dev[t] = 0;
      continue;
    }
    const mean = sum / count;
    let varianceSum = 0;
    for (let i = 0; i < devLen; i++) {
      const c = candles[t - i];
      if (c && typeof c.close === 'number' && !isNaN(c.close)) {
        const diff = c.close - mean;
        varianceSum += diff * diff;
      }
    }
    dev[t] = Math.sqrt(varianceSum / count);
  }

  // 3. Calculate ATR (length: atrLen)
  const atr = new Array(n).fill(0);
  let trSum = 0;
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const prevC = candles[i - 1];
    if (!c || !prevC) continue;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevC.close),
      Math.abs(c.low - prevC.close)
    );
    if (i <= atrLen) {
      trSum += tr;
      atr[i] = trSum / i;
    } else {
      atr[i] = (atr[i - 1] * (atrLen - 1) + tr) / atrLen;
    }
  }

  // 4. Sequential Trend State & Position Tracking
  let trend = 0;
  const points: RibbonPoint[] = new Array(n);
  const allPositions: PositionSetup[] = [];

  let activePos: PositionSetup | null = null;

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const a = alma[i];
    const d = dev[i];
    const r = atr[i];

    if (isNaN(a) || i < Math.max(almaLen, devLen) + slopeLen) {
      points[i] = {
        time: c.time,
        alma: a || c.close,
        ribbonMid: a || c.close,
        ribbonEdge: a || c.close,
        upperConfirm: (a || c.close) + d * devMult,
        lowerConfirm: (a || c.close) - d * devMult,
        trend: 0,
        conviction: 0,
        bullFlip: false,
        bearFlip: false,
      };
      continue;
    }

    const prevAlma = alma[i - slopeLen];
    const slopeScore = r > 0 ? (a - prevAlma) / r : 0.0;

    const upperConfirm = a + d * devMult;
    const lowerConfirm = a - d * devMult;

    const bullSetup = slopeScore > slopeMin && c.close > upperConfirm;
    const bearSetup = slopeScore < -slopeMin && c.close < lowerConfirm;

    let bullFlip = false;
    let bearFlip = false;

    if (trend !== 1 && bullSetup) {
      trend = 1;
      bullFlip = true;
    } else if (trend !== -1 && bearSetup) {
      trend = -1;
      bearFlip = true;
    }

    const bull = trend === 1;
    const bear = trend === -1;
    const flip = bullFlip || bearFlip;

    const distanceScore = r > 0 ? Math.abs(c.close - a) / r : 0.0;
    const conviction = Math.max(
      0.0,
      Math.min(1.0, Math.abs(slopeScore) * 2.0 + distanceScore * 0.35)
    );

    const ribbonEdge = bull ? a - d * 0.55 : bear ? a + d * 0.55 : a;
    const ribbonMid = (a + ribbonEdge) * 0.5;

    // Candle tint color
    let candleColor: string | undefined = undefined;
    if (trend !== 0) {
      const baseCol = bull ? buyCol : sellCol;
      // opacity between 0.28 and 1.0 based on conviction
      const alpha = (0.28 + conviction * 0.72).toFixed(2);
      candleColor = baseCol === buyCol ? `rgba(0, 255, 0, ${alpha})` : `rgba(255, 0, 102, ${alpha})`;
    }

    points[i] = {
      time: c.time,
      alma: a,
      ribbonMid,
      ribbonEdge,
      upperConfirm,
      lowerConfirm,
      trend,
      conviction,
      bullFlip,
      bearFlip,
      candleColor,
    };

    // --- Position Management ---
    // If flip occurred and active position exists, freeze/close active position
    if (flip && activePos && !activePos.positionEnded) {
      activePos.endBar = i;
      activePos.endTime = c.time;
      activePos.positionEnded = true;
      activePos = null;
    }

    // If flip occurred, start new position
    if (flip) {
      const positionDir: 1 | -1 = bull ? 1 : -1;
      const entryPrice = c.close;
      const entryBar = i;

      // Find structure stop from previous stopLookback bars (candles[i-12] to candles[i-1])
      let structureStop = entryPrice;
      const lookbackStart = Math.max(0, i - stopLookback);
      if (positionDir === 1) {
        let lowest = Infinity;
        for (let k = lookbackStart; k < i; k++) {
          if (candles[k] && typeof candles[k].low === 'number' && candles[k].low < lowest) {
            lowest = candles[k].low;
          }
        }
        structureStop = isFinite(lowest) ? lowest : entryPrice - r;
      } else {
        let highest = -Infinity;
        for (let k = lookbackStart; k < i; k++) {
          if (candles[k] && typeof candles[k].high === 'number' && candles[k].high > highest) {
            highest = candles[k].high;
          }
        }
        structureStop = isFinite(highest) ? highest : entryPrice + r;
      }

      const rawRisk = positionDir === 1 ? entryPrice - structureStop : structureStop - entryPrice;
      const minimumRisk = r * minStopAtr;
      const maximumRisk = r * maxStopAtr;

      const riskDist = Math.min(Math.max(rawRisk > 0 ? rawRisk : minimumRisk, minimumRisk), maximumRisk);
      const stopPrice = entryPrice - positionDir * riskDist;

      const targets = [];
      for (let tIdx = 0; tIdx < targetCount; tIdx++) {
        targets.push({
          level: tIdx + 1,
          price: entryPrice + positionDir * riskDist * (tIdx + 1),
          hit: false,
        });
      }

      const newPos: PositionSetup = {
        id: `pos-${entryBar}-${positionDir}`,
        entryBar,
        entryTime: c.time,
        endBar: Math.min(n - 1, entryBar + extendBars),
        direction: positionDir,
        entryPrice,
        stopPrice,
        riskDist,
        targets,
        stoppedOut: false,
        positionEnded: false,
      };

      allPositions.push(newPos);
      activePos = newPos;
    }

    // If position is active, check stop loss and target hits
    if (activePos && !activePos.positionEnded) {
      // Check stop loss hit
      if (i > activePos.entryBar) {
        const stoppedNow =
          activePos.direction === 1
            ? c.low <= activePos.stopPrice
            : c.high >= activePos.stopPrice;

        if (stoppedNow) {
          activePos.stoppedOut = true;
          activePos.positionEnded = true;
          activePos.endBar = i;
          activePos.endTime = c.time;
          activePos = null;
        }
      }

      // Check targets hit
      if (activePos && !activePos.positionEnded) {
        for (const tg of activePos.targets) {
          if (!tg.hit) {
            const hit =
              activePos.direction === 1
                ? c.high >= tg.price
                : c.low <= tg.price;
            if (hit) {
              tg.hit = true;
              tg.hitBar = i;
            }
          }
        }
      }
    }
  }

  // Filter positions to keepPositions most recent
  const keptPositions = allPositions.slice(-keepPositions);

  return {
    points,
    positions: keptPositions,
    currentTrend: trend,
  };
}

export function drawFlagBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  bgColor: string,
  textColor: string = '#FFFFFF'
) {
  if (!isFinite(x) || !isFinite(y)) return;
  ctx.save();
  ctx.font = 'bold 10.5px "JetBrains Mono", monospace';
  const metrics = ctx.measureText(text);
  const textW = metrics.width;
  const paddingX = 8;
  const h = 18;
  const w = textW + paddingX * 2 + 6;
  const arrowW = 6;
  const radius = 3;

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.moveTo(x, y); // Left arrow tip
  ctx.lineTo(x + arrowW, y - h / 2);
  ctx.lineTo(x + w - radius, y - h / 2);
  ctx.arcTo(x + w, y - h / 2, x + w, y - h / 2 + radius, radius);
  ctx.lineTo(x + w, y + h / 2 - radius);
  ctx.arcTo(x + w, y + h / 2, x + w - radius, y + h / 2, radius);
  ctx.lineTo(x + arrowW, y + h / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + arrowW + paddingX - 2, y + 0.5);
  ctx.restore();
}

export function renderTrendTargetRibbonBands(
  ctx: CanvasRenderingContext2D,
  ribbonData: TrendTargetRibbonData,
  timeToX: (time: number) => number,
  priceToY: (price: number) => number,
  chartWidth: number
) {
  const { points } = ribbonData;
  if (!points || points.length === 0) return;

  ctx.save();
  // 1. Render Ribbon Bands and Curves
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    if (!p1 || !p2 || isNaN(p1.alma) || isNaN(p2.alma) || p1.trend === 0 || p2.trend === 0) continue;
    if (p2.bullFlip || p2.bearFlip) continue; // Trend flip break

    const x1 = timeToX(p1.time);
    const x2 = timeToX(p2.time);

    if (!isFinite(x1) || !isFinite(x2)) continue;
    // Skip if completely out of view
    if (Math.max(x1, x2) < -30 || Math.min(x1, x2) > chartWidth + 30) continue;

    const yAlma1 = priceToY(p1.alma);
    const yAlma2 = priceToY(p2.alma);
    const yMid1 = priceToY(p1.ribbonMid);
    const yMid2 = priceToY(p2.ribbonMid);
    const yEdge1 = priceToY(p1.ribbonEdge);
    const yEdge2 = priceToY(p2.ribbonEdge);

    if (
      !isFinite(yAlma1) ||
      !isFinite(yAlma2) ||
      !isFinite(yMid1) ||
      !isFinite(yMid2) ||
      !isFinite(yEdge1) ||
      !isFinite(yEdge2)
    )
      continue;

    const isBull = p1.trend === 1;
    const baseColor = isBull ? '0, 255, 0' : '255, 0, 102';

    // A. Shaded area between Edge and Mid (outer band, opacity ~16%)
    ctx.fillStyle = `rgba(${baseColor}, 0.16)`;
    ctx.beginPath();
    ctx.moveTo(x1, yEdge1);
    ctx.lineTo(x2, yEdge2);
    ctx.lineTo(x2, yMid2);
    ctx.lineTo(x1, yMid1);
    ctx.closePath();
    ctx.fill();

    // B. Shaded area between Mid and ALMA (inner band, opacity ~08%)
    ctx.fillStyle = `rgba(${baseColor}, 0.08)`;
    ctx.beginPath();
    ctx.moveTo(x1, yMid1);
    ctx.lineTo(x2, yMid2);
    ctx.lineTo(x2, yAlma2);
    ctx.lineTo(x1, yAlma1);
    ctx.closePath();
    ctx.fill();

    // C. Ribbon Edge Glow & Stroke
    ctx.strokeStyle = `rgba(${baseColor}, 0.18)`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x1, yEdge1);
    ctx.lineTo(x2, yEdge2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(${baseColor}, 0.75)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, yEdge1);
    ctx.lineTo(x2, yEdge2);
    ctx.stroke();

    // D. Core ALMA Line (Crisp White with Glow)
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.moveTo(x1, yAlma1);
    ctx.lineTo(x2, yAlma2);
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

export function renderTrendTargetRibbonOverlays(
  ctx: CanvasRenderingContext2D,
  candles: Candle[],
  ribbonData: TrendTargetRibbonData,
  timeToX: (time: number) => number,
  priceToY: (price: number) => number,
  chartWidth: number,
  chartHeight: number,
  barWidth: number,
  spacing: number,
  scrollOffset: number
) {
  const { points, positions } = ribbonData;
  if (!points || points.length === 0) return;

  ctx.save();

  // 2. Render Flip Diamonds
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const c = candles[i];
    if (!p || !c || (!p.bullFlip && !p.bearFlip)) continue;

    const x = timeToX(p.time);
    if (!isFinite(x) || x < -20 || x > chartWidth + 20) continue;

    if (p.bullFlip) {
      const y = priceToY(c.low) + 14;
      if (!isFinite(y)) continue;
      ctx.fillStyle = '#00FF00';
      ctx.shadowColor = 'rgba(0, 255, 0, 0.7)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    } else if (p.bearFlip) {
      const y = priceToY(c.high) - 14;
      if (!isFinite(y)) continue;
      ctx.fillStyle = '#FF0066';
      ctx.shadowColor = 'rgba(255, 0, 102, 0.7)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
  }

  // 3. Render Positions (Entry, Stop Loss, Risk Box, Targets T1-T4)
  const latestBarX = chartWidth - scrollOffset;

  positions.forEach((pos) => {
    const startX = timeToX(pos.entryTime);
    let endX: number;
    if (pos.positionEnded && pos.endTime) {
      endX = timeToX(pos.endTime);
      if (!isFinite(endX) || endX <= startX) endX = startX + 30 * (barWidth + spacing);
    } else {
      endX = latestBarX + 30 * (barWidth + spacing);
    }

    if (!isFinite(startX) || !isFinite(endX)) return;
    // Keep within chart visible bounds + small buffer
    if (endX < 0 || startX > chartWidth) return;

    const yEntry = priceToY(pos.entryPrice);
    const yStop = priceToY(pos.stopPrice);
    if (!isFinite(yEntry) || !isFinite(yStop)) return;

    const isLong = pos.direction === 1;
    const posCol = isLong ? '#00FF00' : '#FF0066';

    // A. Shaded Risk Box
    const topRisk = Math.min(yEntry, yStop);
    const botRisk = Math.max(yEntry, yStop);
    ctx.fillStyle = 'rgba(255, 0, 102, 0.12)';
    ctx.fillRect(startX, topRisk, endX - startX, botRisk - topRisk);
    ctx.strokeStyle = 'rgba(255, 0, 102, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, topRisk, endX - startX, botRisk - topRisk);

    // B. Stop Loss Line & Tag
    // Glow
    ctx.strokeStyle = 'rgba(255, 0, 102, 0.25)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(startX, yStop);
    ctx.lineTo(endX, yStop);
    ctx.stroke();

    // Core
    ctx.strokeStyle = '#FF0066';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, yStop);
    ctx.lineTo(endX, yStop);
    ctx.stroke();

    // Stop Loss Label Tag
    const slText = pos.stoppedOut ? 'SL  -1R  ✓' : 'SL  -1R';
    drawFlagBadge(ctx, endX, yStop, slText, '#FF0066', '#FFFFFF');

    // C. Entry Line & Tag
    // Glow
    ctx.strokeStyle = isLong ? 'rgba(0, 255, 0, 0.25)' : 'rgba(255, 0, 102, 0.25)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(startX, yEntry);
    ctx.lineTo(endX, yEntry);
    ctx.stroke();

    // Core
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX, yEntry);
    ctx.lineTo(endX, yEntry);
    ctx.stroke();

    // Entry Label Tag
    const entryText = isLong ? 'LONG' : 'SHORT';
    drawFlagBadge(ctx, endX, yEntry, entryText, posCol, isLong ? '#000000' : '#FFFFFF');

    // D. Profit Targets (T1 - T4)
    let prevLevelY = yEntry;

    pos.targets.forEach((target) => {
      const yTarget = priceToY(target.price);
      if (!isFinite(yTarget)) return;

      // Shaded band between previous level and target
      const topBand = Math.min(prevLevelY, yTarget);
      const botBand = Math.max(prevLevelY, yTarget);
      ctx.fillStyle = target.hit ? 'rgba(0, 255, 0, 0.10)' : 'rgba(0, 255, 0, 0.05)';
      ctx.fillRect(startX, topBand, endX - startX, botBand - topBand);

      // Target Line Glow
      ctx.strokeStyle = target.hit ? 'rgba(0, 255, 0, 0.4)' : 'rgba(0, 255, 0, 0.2)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(startX, yTarget);
      ctx.lineTo(endX, yTarget);
      ctx.stroke();

      // Target Line Core
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = target.hit ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(startX, yTarget);
      ctx.lineTo(endX, yTarget);
      ctx.stroke();

      // Target Label Tag
      const tgText = `T${target.level}  ${target.level}R${target.hit ? '  ✓' : ''}`;
      drawFlagBadge(ctx, endX, yTarget, tgText, '#00FF00', '#000000');

      prevLevelY = yTarget;
    });
  });

  ctx.restore();
}

export function renderTrendTargetRibbon(
  ctx: CanvasRenderingContext2D,
  candles: Candle[],
  ribbonData: TrendTargetRibbonData,
  timeToX: (time: number) => number,
  priceToY: (price: number) => number,
  chartWidth: number,
  chartHeight: number,
  barWidth: number,
  spacing: number,
  scrollOffset: number
) {
  renderTrendTargetRibbonBands(ctx, ribbonData, timeToX, priceToY, chartWidth);
  renderTrendTargetRibbonOverlays(
    ctx,
    candles,
    ribbonData,
    timeToX,
    priceToY,
    chartWidth,
    chartHeight,
    barWidth,
    spacing,
    scrollOffset
  );
}


